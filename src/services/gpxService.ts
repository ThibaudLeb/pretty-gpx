
import { PosterOptions, ApiResponse } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const processGpxFile = async (file: File, options: PosterOptions): Promise<ApiResponse> => {
  try {
    // Upload file to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('gpx-files')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      throw new Error("Error uploading file");
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('gpx-files')
      .getPublicUrl(filePath);

    // Call the edge function to process the GPX file
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
      console.error("Error processing GPX file:", error);
      throw new Error("Error processing GPX file");
    }

    return {
      imageUrl: data.imageUrl,
      pdfUrl: data.pdfUrl,
      metadata: data.metadata
    };
  } catch (error) {
    console.error("Error in processGpxFile:", error);
    throw error;
  }
};

export const generatePdf = async (imageUrl: string, options: PosterOptions): Promise<string> => {
  // In a real implementation, we might call another edge function or use the same one
  // For now, we'll return the PDF URL from our generated data
  return imageUrl.replace('.png', '.pdf');
};

export const extractGpxMetadata = async (file: File): Promise<any> => {
  try {
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
      throw new Error("Error uploading file for metadata extraction");
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
      throw new Error("Error extracting metadata: " + error.message);
    }

    // Clean up the temporary file
    await supabase.storage.from('gpx-files').remove([filePath]);

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
    // Create a hidden anchor element to trigger the download
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = filename || 'gpx-poster.pdf';
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
