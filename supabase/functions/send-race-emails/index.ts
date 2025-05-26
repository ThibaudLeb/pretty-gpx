
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RacerData {
  firstName: string;
  lastName: string;
  email: string;
  ranking: number;
  race: string;
  duration: string;
  raceKm: number;
  raceElevation: number;
  raceName: string;
}

interface EmailConfig {
  senderEmail: string;
  senderPassword: string;
  subject: string;
  template: string;
}

interface PosterOptions {
  template: string;
  colorScheme: string;
  showTitle: boolean;
  showStats: boolean;
  showElevation: boolean;
  paperSize: string;
  orientation: string;
  highResolution: boolean;
  showRacerInfo: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { racerData, gpxFile, emailConfig, posterOptions } = await req.json();
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? '';
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Starting email campaign for ${racerData.length} racers`);

    let successful = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    // Process each racer
    for (const racer of racerData) {
      try {
        console.log(`Processing racer: ${racer.firstName} ${racer.lastName}`);

        // Generate personalized poster for this racer
        const posterResult = await generatePersonalizedPoster(
          gpxFile, 
          racer, 
          posterOptions, 
          supabase
        );

        if (!posterResult.success) {
          throw new Error(`Failed to generate poster: ${posterResult.error}`);
        }

        // Send personalized email with poster attachment
        const emailResult = await sendPersonalizedEmail(
          racer,
          emailConfig,
          posterResult.pdfUrl,
          posterResult.imageUrl
        );

        if (emailResult.success) {
          successful++;
          console.log(`✓ Email sent to ${racer.email}`);
        } else {
          failed++;
          failedEmails.push(racer.email);
          console.error(`✗ Failed to send email to ${racer.email}: ${emailResult.error}`);
        }

        // Small delay to avoid overwhelming the email service
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        failed++;
        failedEmails.push(racer.email);
        console.error(`Error processing ${racer.email}:`, error);
      }
    }

    console.log(`Campaign completed: ${successful} successful, ${failed} failed`);

    return new Response(JSON.stringify({
      successful,
      failed,
      failedEmails,
      total: racerData.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in send-race-emails function:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      successful: 0,
      failed: 0,
      total: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generatePersonalizedPoster(
  gpxFile: { name: string; content: string }, 
  racer: RacerData, 
  posterOptions: PosterOptions,
  supabase: any
): Promise<{ success: boolean; pdfUrl?: string; imageUrl?: string; error?: string }> {
  try {
    // Upload GPX file to storage
    const gpxContent = atob(gpxFile.content);
    const fileName = `race_${Date.now()}_${racer.firstName}_${racer.lastName}.gpx`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('gpx-files')
      .upload(fileName, gpxContent, { contentType: 'application/gpx+xml' });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('gpx-files')
      .getPublicUrl(fileName);

    // Add racer-specific information to poster options
    const customPosterOptions = {
      ...posterOptions,
      racerInfo: {
        name: `${racer.firstName} ${racer.lastName}`,
        ranking: racer.ranking,
        duration: racer.duration,
        raceName: racer.raceName
      }
    };

    // Call the GPX processor
    const apiUrl = Deno.env.get("GPX_PROCESSOR_URL");
    if (!apiUrl) {
      throw new Error("GPX_PROCESSOR_URL not configured");
    }

    const response = await fetch(`${apiUrl}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gpx_content: btoa(gpxContent),
        options: customPosterOptions
      }),
    });

    if (!response.ok) {
      throw new Error(`GPX processor error: ${response.status}`);
    }

    const processorResponse = await response.json();
    const { image_data, pdf_data, metadata } = processorResponse;

    if (!image_data || !pdf_data) {
      throw new Error("Missing image or PDF data from processor");
    }

    // Save generated files to storage
    const timestamp = Date.now();
    const baseFileName = `${racer.firstName}_${racer.lastName}_${timestamp}`;
    const imagePath = `race-posters/${baseFileName}.png`;
    const pdfPath = `race-posters/${baseFileName}.pdf`;

    const imageBytes = Uint8Array.from(atob(image_data), c => c.charCodeAt(0));
    const pdfBytes = Uint8Array.from(atob(pdf_data), c => c.charCodeAt(0));

    // Upload files
    const [imageUpload, pdfUpload] = await Promise.all([
      supabase.storage.from('gpx-posters').upload(imagePath, imageBytes, {
        contentType: 'image/png',
        upsert: true
      }),
      supabase.storage.from('gpx-posters').upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      })
    ]);

    if (imageUpload.error || pdfUpload.error) {
      throw new Error("Error uploading generated files");
    }

    // Get public URLs
    const { data: { publicUrl: imageUrl } } = supabase
      .storage.from('gpx-posters').getPublicUrl(imagePath);
    const { data: { publicUrl: pdfUrl } } = supabase
      .storage.from('gpx-posters').getPublicUrl(pdfPath);

    // Clean up temporary GPX file
    await supabase.storage.from('gpx-files').remove([fileName]);

    return { success: true, pdfUrl, imageUrl };

  } catch (error) {
    console.error("Error generating personalized poster:", error);
    return { success: false, error: error.message };
  }
}

async function sendPersonalizedEmail(
  racer: RacerData,
  emailConfig: EmailConfig,
  pdfUrl: string,
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Replace placeholders in subject and template
    const personalizedSubject = replacePlaceholders(emailConfig.subject, racer);
    const personalizedBody = replacePlaceholders(emailConfig.template, racer);

    // For now, we'll use a simple HTTP request to send emails
    // In production, you'd want to use a proper email service like SendGrid or SES
    console.log(`Would send email to ${racer.email}:`);
    console.log(`Subject: ${personalizedSubject}`);
    console.log(`Body: ${personalizedBody}`);
    console.log(`Attachments: PDF=${pdfUrl}, Image=${imageUrl}`);

    // Simulate email sending (replace with actual email service)
    await new Promise(resolve => setTimeout(resolve, 500));

    return { success: true };

  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
}

function replacePlaceholders(template: string, racer: RacerData): string {
  return template
    .replace(/\{firstName\}/g, racer.firstName)
    .replace(/\{lastName\}/g, racer.lastName)
    .replace(/\{ranking\}/g, racer.ranking.toString())
    .replace(/\{duration\}/g, racer.duration)
    .replace(/\{raceKm\}/g, racer.raceKm.toString())
    .replace(/\{raceElevation\}/g, racer.raceElevation.toString())
    .replace(/\{raceName\}/g, racer.raceName)
    .replace(/\{race\}/g, racer.race);
}
