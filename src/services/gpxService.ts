
import { PosterOptions } from "@/types";

// This is a mock service that would normally communicate with a backend API
// to process the GPX file and generate the poster

export const processGpxFile = async (file: File, options: PosterOptions): Promise<string> => {
  return new Promise((resolve) => {
    // In a real application, we would upload the file to a server
    // that runs the pretty-gpx Python scripts
    console.log("Processing GPX file with options:", options);
    
    // Simulating API delay
    setTimeout(() => {
      // Return a placeholder image for now
      // In a real application, this would be the URL of the generated poster
      resolve("https://via.placeholder.com/800x1000/3B82F6/FFFFFF?text=GPX+Poster+Preview");
    }, 1500);
  });
};

export const generatePdf = async (imageUrl: string, options: PosterOptions): Promise<string> => {
  return new Promise((resolve) => {
    console.log("Generating PDF with options:", options);
    
    // Simulating API delay
    setTimeout(() => {
      // Return a mock PDF URL
      // In a real application, this would be the URL of the generated PDF
      resolve("#");
    }, 1000);
  });
};

// Helper function to extract basic info from a GPX file
export const extractGpxMetadata = async (file: File): Promise<any> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      
      // This is a very basic parser and would not work with all GPX files
      // In a real application, we would use a proper GPX parser library or backend service
      const nameMatch = content.match(/<name>(.*?)<\/name>/);
      const name = nameMatch ? nameMatch[1] : file.name.replace('.gpx', '');
      
      // Mock metadata, in a real application this would be extracted from the GPX
      resolve({
        title: name,
        distance: 12.5, // km
        elevation: 453, // meters
        duration: "1h 45m",
        date: "2023-09-15"
      });
    };
    
    reader.readAsText(file);
  });
};
