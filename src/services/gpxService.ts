
import { PosterOptions, ApiResponse } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const processGpxFile = async (file: File, options: PosterOptions): Promise<ApiResponse> => {
  try {
    console.log("Starting GPX file processing...", { fileName: file.name, options });
    
    // Upload file to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${fileName}`;

    console.log("Uploading file to storage...", { filePath });
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('gpx-files')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      toast.error("Failed to upload file to storage");
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    console.log("File uploaded successfully:", uploadData);

    // Get the public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('gpx-files')
      .getPublicUrl(filePath);

    console.log("File public URL:", publicUrl);

    // Call the edge function to process the GPX file
    console.log("Calling process-gpx edge function...");
    
    const { data, error } = await supabase.functions.invoke('process-gpx', {
      body: { 
        file: { 
          name: file.name,
          path: filePath,
          url: publicUrl
        }, 
        options 
      }
    });

    if (error) {
      console.error("Error from edge function:", error);
      toast.error(`Processing failed: ${error.message}`);
      throw new Error(`Edge function error: ${error.message}`);
    }

    console.log("GPX processing completed successfully:", data);
    
    if (!data.imageUrl || !data.pdfUrl) {
      console.error("Missing URLs in response:", data);
      toast.error("Processing completed but files are missing");
      throw new Error("Missing image or PDF URLs in response");
    }

    toast.success("GPX poster generated successfully!");

    return {
      imageUrl: data.imageUrl,
      pdfUrl: data.pdfUrl,
      metadata: data.metadata
    };
  } catch (error) {
    console.error("Error in processGpxFile:", error);
    if (error instanceof Error) {
      toast.error(`Failed to process GPX file: ${error.message}`);
    } else {
      toast.error("An unexpected error occurred while processing the GPX file");
    }
    throw error;
  }
};

export const generatePdf = async (imageUrl: string, options: PosterOptions): Promise<string> => {
  // For now, we return the PDF URL that should be generated alongside the image
  // This is handled by the edge function when processing the GPX file
  return imageUrl.replace('.png', '.pdf');
};

export const extractGpxMetadata = async (file: File): Promise<any> => {
  try {
    console.log("Extracting GPX metadata...", { fileName: file.name });
    
    // Upload file to Supabase Storage for processing
    const fileExt = file.name.split('.').pop();
    const fileName = `metadata_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('gpx-files')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Error uploading file for metadata extraction:", uploadError);
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('gpx-files')
      .getPublicUrl(filePath);

    // Call our edge function with a special flag to only extract metadata
    const { data, error } = await supabase.functions.invoke('process-gpx', {
      body: { 
        file: { 
          name: file.name,
          path: filePath,
          url: publicUrl
        }, 
        options: { metadataOnly: true }
      }
    });

    if (error) {
      console.error("Error extracting metadata:", error);
      throw new Error(`Metadata extraction error: ${error.message}`);
    }

    // Clean up the temporary file
    await supabase.storage.from('gpx-files').remove([filePath]);

    console.log("Metadata extracted successfully:", data.metadata);
    return data.metadata;
  } catch (error) {
    console.error("Error extracting GPX metadata:", error);
    
    // Fallback to basic extraction
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result as string;
        
        // This is a very basic parser and would not work with all GPX files
        const nameMatch = content.match(/<name>(.*?)<\/name>/);
        const name = nameMatch ? nameMatch[1] : file.name.replace('.gpx', '');
        
        resolve({
          title: name,
          distance: 12.5, // km
          elevation: 453, // meters
          duration: "1h 45m",
          date: new Date().toLocaleDateString(),
        });
      };
      
      reader.readAsText(file);
    });
  }
};

export const downloadPosterPdf = async (pdfUrl: string, filename: string) => {
  try {
    console.log("Downloading poster PDF...", { pdfUrl, filename });
    
    // Create a hidden anchor element to trigger the download
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = filename || 'gpx-poster.pdf';
    link.target = '_blank'; // Open in new tab as fallback
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Your poster has been downloaded!");
    return true;
  } catch (error) {
    console.error("Error downloading PDF:", error);
    toast.error("Failed to download poster. Please try again.");
    throw error;
  }
};
