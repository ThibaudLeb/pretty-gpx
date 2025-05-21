
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

    // In a production environment, this would be the URL of the Docker container
    // For now, we'll use a simple URL for local development
    const apiUrl = Deno.env.get("GPX_PROCESSOR_URL") || "http://localhost:8080";
    
    console.log(`Calling GPX processor API at: ${apiUrl}`);
    
    // Call the Docker container API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gpx_content: gpxBase64,
        options: options
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error calling GPX processor: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const processorResponse = await response.json();
    
    // Get image and pdf data from the response
    const { image_data, pdf_data, metadata } = processorResponse;
    
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
      throw error;
    }

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
