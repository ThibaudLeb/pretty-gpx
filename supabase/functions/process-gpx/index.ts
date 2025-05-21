
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

    // In a real implementation, we would:
    // 1. Download the GPX file from storage
    // 2. Use a Python runtime within Deno or call an external API that runs the pretty-gpx code
    // 3. Upload the generated poster back to storage
    
    // For now, we'll simulate the processing with mock data
    const mockMetadata = processGpxMock(file, options);
    
    // Record the poster generation in the database
    const { data, error } = await supabase
      .from('gpx_posters')
      .insert({
        original_filename: file.name,
        image_url: mockMetadata.imageUrl,
        pdf_url: mockMetadata.pdfUrl,
        title: mockMetadata.metadata.title,
        distance: mockMetadata.metadata.distance,
        elevation: mockMetadata.metadata.elevation,
        duration: mockMetadata.metadata.duration,
        date: mockMetadata.metadata.date,
        options: options,
        status: 'completed'
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(mockMetadata), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Mock implementation that returns data as if the GPX was processed
function processGpxMock(file, options) {
  // In reality, this would be where we call the Python scripts
  // For now, we're returning mock data
  
  console.log(`Processing file: ${file.name} with options:`, options);
  
  // Generate different mock images based on the selected template and color scheme
  let imageUrl = '';
  if (options.template === 'minimal') {
    imageUrl = 'https://images.unsplash.com/photo-1498354178607-a79df2916198?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&h=1200&q=80';
  } else if (options.template === 'detailed') {
    imageUrl = 'https://images.unsplash.com/photo-1508962914676-134849a727f0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&h=1200&q=80';
  } else if (options.template === 'topographic') {
    imageUrl = 'https://images.unsplash.com/photo-1509059852496-f3822ae057bf?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&h=1200&q=80';
  } else {
    // standard template
    imageUrl = 'https://images.unsplash.com/photo-1565014904718-25d14337ca1c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&h=1200&q=80';
  }
  
  // Simulate different metadata based on the filename
  const isLongDistance = file.name.toLowerCase().includes('marathon') || file.name.toLowerCase().includes('long');
  const isHilly = file.name.toLowerCase().includes('mountain') || file.name.toLowerCase().includes('hill');
  
  return {
    imageUrl: imageUrl,
    pdfUrl: "https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/mockup-1.pdf",
    metadata: {
      title: file.name.replace('.gpx', ''),
      distance: isLongDistance ? 21.5 : 8.3,
      elevation: isHilly ? 750 : 120,
      duration: isLongDistance ? "2h 10m" : "45m",
      date: new Date().toLocaleDateString(),
    }
  };
}
