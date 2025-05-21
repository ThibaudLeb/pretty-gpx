
import { PosterOptions, ApiResponse } from "@/types";
import { supabase } from "@/integrations/supabase/client";

export const processGpxFile = async (file: File, options: PosterOptions): Promise<string> => {
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

    return data.imageUrl;
  } catch (error) {
    console.error("Error in processGpxFile:", error);
    throw error;
  }
};

export const generatePdf = async (imageUrl: string, options: PosterOptions): Promise<string> => {
  // In a real implementation, we might call another edge function or use the same one
  // For now, we'll just return the PDF URL from our mock data
  return "https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/mockup-1.pdf";
};

export const extractGpxMetadata = async (file: File): Promise<any> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      
      // This is a very basic parser and would not work with all GPX files
      // In a real application, we would use the edge function to extract metadata
      const nameMatch = content.match(/<name>(.*?)<\/name>/);
      const name = nameMatch ? nameMatch[1] : file.name.replace('.gpx', '');
      
      // For now, just return some basic metadata
      // In the real implementation, this would come from the edge function
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
};

export const downloadPosterPdf = async (pdfUrl: string, filename: string) => {
  try {
    // In a real implementation, we would download the PDF from the URL
    // For now, we'll simulate a download by opening the URL in a new tab
    window.open(pdfUrl, "_blank");
    return true;
  } catch (error) {
    console.error("Error downloading PDF:", error);
    throw error;
  }
};
