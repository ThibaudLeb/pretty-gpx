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

interface GmailTokens {
  access_token: string;
  refresh_token: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { racerData, gpxFile, emailConfig, posterOptions } = await req.json();
    
    console.log('Received request with:', {
      racerCount: racerData?.length,
      gpxFileName: gpxFile?.name,
      hasEmailConfig: !!emailConfig,
      hasPosterOptions: !!posterOptions
    });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? '';
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if Gmail tokens are available
    const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID");
    const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
    const gmailRefreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");

    if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
      console.error("Gmail OAuth credentials are not properly configured");
      throw new Error("Gmail OAuth credentials are missing. Please configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN");
    }

    console.log(`Starting email campaign for ${racerData.length} racers using Gmail`);

    let successful = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    // Get Gmail access token
    const accessToken = await getGmailAccessToken(gmailClientId, gmailClientSecret, gmailRefreshToken);

    // Process each racer
    for (const racer of racerData) {
      try {
        console.log(`Processing racer: ${racer.firstName} ${racer.lastName} (${racer.email})`);

        // Generate personalized poster for this racer
        const posterResult = await generatePersonalizedPoster(
          gpxFile, 
          racer, 
          posterOptions, 
          supabase
        );

        if (!posterResult.success) {
          console.error(`Failed to generate poster for ${racer.email}:`, posterResult.error);
          throw new Error(`Failed to generate poster: ${posterResult.error}`);
        }

        console.log(`Generated poster for ${racer.email}:`, {
          imageUrl: posterResult.imageUrl,
          pdfUrl: posterResult.pdfUrl
        });

        // Send personalized email with poster attachment using Gmail
        const emailResult = await sendGmailEmail(
          racer,
          emailConfig,
          posterResult.pdfUrl!,
          posterResult.imageUrl!,
          accessToken
        );

        if (emailResult.success) {
          successful++;
          console.log(`✓ Email sent successfully to ${racer.email}`);
        } else {
          failed++;
          failedEmails.push(racer.email);
          console.error(`✗ Failed to send email to ${racer.email}:`, emailResult.error);
        }

        // Small delay to avoid overwhelming Gmail API
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

async function getGmailAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh Gmail token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error getting Gmail access token:", error);
    throw new Error(`Gmail authentication failed: ${error.message}`);
  }
}

async function generatePersonalizedPoster(
  gpxFile: { name: string; content: string }, 
  racer: RacerData, 
  posterOptions: PosterOptions,
  supabase: any
): Promise<{ success: boolean; pdfUrl?: string; imageUrl?: string; error?: string }> {
  try {
    console.log(`Generating poster for ${racer.firstName} ${racer.lastName}`);
    
    // Upload GPX file to storage
    const gpxContent = atob(gpxFile.content);
    const fileName = `race_${Date.now()}_${racer.firstName}_${racer.lastName}.gpx`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('gpx-files')
      .upload(fileName, gpxContent, { contentType: 'application/gpx+xml' });

    if (uploadError) {
      console.error(`Upload error for ${racer.email}:`, uploadError);
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    console.log(`GPX file uploaded for ${racer.email}:`, fileName);

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

    console.log(`Calling GPX processor for ${racer.email}`);
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
      const errorText = await response.text();
      console.error(`GPX processor error for ${racer.email}:`, response.status, errorText);
      throw new Error(`GPX processor error: ${response.status} - ${errorText}`);
    }

    const processorResponse = await response.json();
    const { image_data, pdf_data } = processorResponse;

    if (!image_data || !pdf_data) {
      console.error(`Missing data from processor for ${racer.email}:`, { hasImage: !!image_data, hasPdf: !!pdf_data });
      throw new Error("Missing image or PDF data from processor");
    }

    console.log(`GPX processing completed for ${racer.email}`);

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
      console.error(`Error uploading files for ${racer.email}:`, { 
        imageError: imageUpload.error, 
        pdfError: pdfUpload.error 
      });
      throw new Error("Error uploading generated files");
    }

    console.log(`Files uploaded successfully for ${racer.email}`);

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

async function sendGmailEmail(
  racer: RacerData,
  emailConfig: EmailConfig,
  pdfUrl: string,
  imageUrl: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Sending email via Gmail to ${racer.email}`);

    // Replace placeholders in subject and template
    const personalizedSubject = replacePlaceholders(emailConfig.subject, racer);
    const personalizedBody = replacePlaceholders(emailConfig.template, racer);

    // Download PDF for attachment
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }
    
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    // Create email message in RFC 2822 format
    const boundary = "boundary_" + Math.random().toString(36);
    const htmlBody = `
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
    `;

    const message = [
      `To: ${racer.email}`,
      `Subject: ${personalizedSubject}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
      ``,
      `--${boundary}`,
      `Content-Type: application/pdf`,
      `Content-Disposition: attachment; filename="${racer.firstName}_${racer.lastName}_race_poster.pdf"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      pdfBase64,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    // Send email using Gmail API
    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: btoa(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      }),
    });

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      console.error(`Gmail API error for ${racer.email}:`, gmailResponse.status, errorText);
      throw new Error(`Gmail API error: ${gmailResponse.status} - ${errorText}`);
    }

    const result = await gmailResponse.json();
    console.log(`Email sent successfully to ${racer.email} via Gmail:`, result.id);
    return { success: true };

  } catch (error) {
    console.error("Error sending Gmail email:", error);
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
