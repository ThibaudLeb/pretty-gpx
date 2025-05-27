
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

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

    // Initialize Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    const resend = new Resend(resendApiKey);

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
          posterResult.pdfUrl!,
          posterResult.imageUrl!,
          resend
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
    const { image_data, pdf_data } = processorResponse;

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
  imageUrl: string,
  resend: any
): Promise<{ success: boolean; error?: string }> {
  try {
    // Replace placeholders in subject and template
    const personalizedSubject = replacePlaceholders(emailConfig.subject, racer);
    const personalizedBody = replacePlaceholders(emailConfig.template, racer);

    // Download PDF for attachment
    const pdfResponse = await fetch(pdfUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    // Send email with Resend
    const emailResponse = await resend.emails.send({
      from: "Race Results <onboarding@resend.dev>", // Use verified domain
      to: [racer.email],
      subject: personalizedSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Congratulations ${racer.firstName}!</h1>
          <div style="white-space: pre-line; margin: 20px 0;">${personalizedBody}</div>
          <div style="margin: 20px 0;">
            <img src="${imageUrl}" alt="Your Race Poster" style="max-width: 100%; height: auto; border-radius: 8px;" />
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            Your personalized race poster is also attached as a PDF for high-quality printing.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `${racer.firstName}_${racer.lastName}_race_poster.pdf`,
          content: pdfBase64,
          type: 'application/pdf',
        },
      ],
    });

    if (emailResponse.error) {
      throw new Error(emailResponse.error.message);
    }

    console.log(`Email sent successfully to ${racer.email}:`, emailResponse.id);
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
