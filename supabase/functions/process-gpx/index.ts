
// Follow this setup guide to integrate the Deno runtime into your application:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file, options } = await req.json();
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? '';
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Processing file: ${file.name} with options:`, options);

    // Check if this is a metadata-only request
    if (options.metadataOnly) {
      // For metadata-only requests, we'll extract basic info from the GPX file
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('gpx-files')
        .download(file.path);

      if (downloadError) {
        throw new Error(`Error downloading file: ${downloadError.message}`);
      }

      const gpxContent = await fileData.text();
      
      // Basic GPX metadata extraction
      const nameMatch = gpxContent.match(/<name>(.*?)<\/name>/);
      const title = nameMatch ? nameMatch[1] : file.name.replace('.gpx', '');
      
      // Extract track points for basic calculations
      const trkptMatches = gpxContent.match(/<trkpt[^>]*lat="([^"]*)"[^>]*lon="([^"]*)"[^>]*>/g);
      const distance = trkptMatches ? (trkptMatches.length * 0.1) : 10; // Rough estimate
      
      const metadata = {
        title: title,
        distance: distance,
        elevation: 200,
        duration: "1h 30m",
        date: new Date().toLocaleDateString(),
      };

      return new Response(JSON.stringify({ metadata }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the GPX file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('gpx-files')
      .download(file.path);

    if (downloadError) {
      throw new Error(`Error downloading file: ${downloadError.message}`);
    }

    // Convert the file to a base64 string for passing to the Docker container
    const gpxContent = await fileData.text();
    const gpxBase64 = btoa(gpxContent);

    // Get the Cloud Run service URL from environment
    const apiUrl = Deno.env.get("GPX_PROCESSOR_URL");
    
    if (!apiUrl) {
      throw new Error("GPX_PROCESSOR_URL environment variable is not set. Please configure it in the Supabase Edge Functions secrets.");
    }
    
    console.log(`Calling GPX processor API at: ${apiUrl}`);
    
    // Call the Docker container API with better error handling
    let response;
    try {
      response = await fetch(`${apiUrl}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Supabase-Edge-Function/1.0',
        },
        body: JSON.stringify({
          gpx_content: gpxBase64,
          options: options
        }),
      });
    } catch (fetchError) {
      console.error("Network error calling GPX processor:", fetchError);
      throw new Error(`Network error calling GPX processor: ${fetchError.message}`);
    }
    
    console.log(`GPX processor response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GPX processor error response: ${errorText}`);
      
      if (response.status === 403) {
        throw new Error(`Access denied to GPX processor. Please ensure the Cloud Run service allows unauthenticated requests. Status: ${response.status}`);
      } else if (response.status === 404) {
        throw new Error(`GPX processor service not found. Please check the GPX_PROCESSOR_URL. Status: ${response.status}`);
      } else {
        throw new Error(`GPX processor error (${response.status}): ${errorText}`);
      }
    }
    
    let processorResponse;
    try {
      processorResponse = await response.json();
    } catch (jsonError) {
      console.error("Error parsing GPX processor response:", jsonError);
      throw new Error("Invalid response from GPX processor - not valid JSON");
    }
    
    console.log("GPX processor response received successfully");
    
    // Get image and pdf data from the response
    const { image_data, pdf_data, metadata } = processorResponse;
    
    if (!image_data || !pdf_data) {
      throw new Error("GPX processor did not return image or PDF data");
    }
    
    // Save the image and PDF to Supabase storage
    const imageBase64 = image_data;
    const pdfBase64 = pdf_data;
    
    // Convert base64 strings to Uint8Arrays
    const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    
    // Generate unique filenames
    const timestamp = new Date().getTime();
    const imagePath = `posters/${file.name.replace('.gpx', '')}_${timestamp}.png`;
    const pdfPath = `posters/${file.name.replace('.gpx', '')}_${timestamp}.pdf`;
    
    // Upload the files to storage
    const { data: imageData, error: imageError } = await supabase
      .storage
      .from('gpx-posters')
      .upload(imagePath, imageBytes, {
        contentType: 'image/png',
        upsert: true
      });
      
    if (imageError) {
      console.error("Error uploading image:", imageError);
      throw new Error(`Error uploading image: ${imageError.message}`);
    }
    
    const { data: pdfData, error: pdfError } = await supabase
      .storage
      .from('gpx-posters')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });
      
    if (pdfError) {
      console.error("Error uploading PDF:", pdfError);
      throw new Error(`Error uploading PDF: ${pdfError.message}`);
    }
    
    // Get public URLs for the uploaded files
    const { data: { publicUrl: imageUrl } } = supabase
      .storage
      .from('gpx-posters')
      .getPublicUrl(imagePath);
      
    const { data: { publicUrl: pdfUrl } } = supabase
      .storage
      .from('gpx-posters')
      .getPublicUrl(pdfPath);
    
    // Record the poster generation in the database
    const { data, error } = await supabase
      .from('gpx_posters')
      .insert({
        original_filename: file.name,
        image_url: imageUrl,
        pdf_url: pdfUrl,
        title: metadata.title,
        distance: metadata.distance,
        elevation: metadata.elevation,
        duration: metadata.duration,
        date: metadata.date,
        options: options,
        status: 'completed'
      })
      .select()
      .single();
    
    if (error) {
      console.error("Error saving to database:", error);
      throw new Error(`Error saving to database: ${error.message}`);
    }

    console.log("Successfully processed GPX file and saved to database");

    // Return the final response with URLs and metadata
    return new Response(JSON.stringify({
      imageUrl: imageUrl,
      pdfUrl: pdfUrl,
      metadata: metadata
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing GPX file:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: "Check the edge function logs for more information"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
