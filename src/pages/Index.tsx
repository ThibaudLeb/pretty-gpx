import React, { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FileUpload from "@/components/FileUpload";
import PosterPreview from "@/components/PosterPreview";
import PosterOptions from "@/components/PosterOptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PosterOptions as PosterOptionsType, ApiResponse } from "@/types";
import { processGpxFile, extractGpxMetadata, downloadPosterPdf } from "@/services/gpxService";

const Index = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | undefined>(undefined);
  const [options, setOptions] = useState<PosterOptionsType>({
    template: "standard",
    colorScheme: "default",
    lineWidth: 3,
    showTitle: true,
    showStats: true,
    showElevation: true,
    paperSize: "a4",
    orientation: "portrait",
    highResolution: false
  });

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    
    try {
      // Extract basic metadata from GPX file
      const extractedMetadata = await extractGpxMetadata(selectedFile);
      setMetadata(extractedMetadata);
      
      // Process the GPX file using our Supabase function
      const response = await processGpxFile(selectedFile, options);
      setPreviewUrl(response.imageUrl);
      setPdfUrl(response.pdfUrl);
      
      // Update metadata with any additional information from the processor
      if (response.metadata) {
        setMetadata(response.metadata);
      }
      
      toast.success("GPX file processed successfully");
    } catch (error) {
      console.error("Error processing GPX file:", error);
      toast.error("Error processing GPX file. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOptionsChange = async (newOptions: PosterOptionsType) => {
    setOptions(newOptions);
    
    // Only regenerate the preview if we have a file
    if (file) {
      setLoading(true);
      try {
        const response = await processGpxFile(file, newOptions);
        setPreviewUrl(response.imageUrl);
        setPdfUrl(response.pdfUrl);
        
        // Update metadata with any additional information from the processor
        if (response.metadata) {
          setMetadata(response.metadata);
        }
      } catch (error) {
        console.error("Error updating preview:", error);
        toast.error("Error updating preview. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownload = async () => {
    if (!pdfUrl) return;
    
    toast.success("Preparing your PDF poster for download...");
    
    try {
      // Download the PDF using the pdfUrl
      await downloadPosterPdf(pdfUrl, `${metadata?.title || 'gpx-poster'}.pdf`);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Error downloading PDF. Please try again.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-1 container py-8">
        <section className="mb-10">
          <h2 className="text-3xl font-bold mb-2">Create Your GPX Poster</h2>
          <p className="text-muted-foreground">
            Upload your GPX file and customize your poster with our easy-to-use tools.
          </p>
        </section>
        
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileUpload onFileSelected={handleFileSelected} />
            
            <div className="mt-10 text-center">
              <h3 className="text-xl font-semibold mb-4">What is GPX Poster Creator?</h3>
              <p className="text-muted-foreground">
                Create beautiful posters from your running, cycling, or hiking activities. 
                Simply upload your GPX file, customize your design, and download a stunning 
                visual representation of your adventure.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <div className="space-y-6">
                <PosterPreview imageUrl={previewUrl} loading={loading} />
                
                {metadata && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="text-xl font-semibold mb-4">{metadata.title || "Activity Details"}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Distance</p>
                          <p className="font-medium">{metadata.distance} km</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Elevation</p>
                          <p className="font-medium">{metadata.elevation} m</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Duration</p>
                          <p className="font-medium">{metadata.duration}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Date</p>
                          <p className="font-medium">{metadata.date}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                <div className="flex justify-center">
                  <Button 
                    size="lg" 
                    className="gap-2 bg-gpx-primary hover:bg-blue-600"
                    onClick={handleDownload}
                    disabled={!previewUrl || loading}
                  >
                    <Download className="h-5 w-5" />
                    Download Poster
                  </Button>
                </div>
              </div>
            </div>
            
            <div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Customize Your Poster</h3>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    Upload New
                  </Button>
                </div>
                <Separator />
                <PosterOptions options={options} onOptionsChange={handleOptionsChange} />
              </div>
            </div>
          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
