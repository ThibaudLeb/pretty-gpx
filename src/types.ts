
export interface PosterOptions {
  template: string;
  colorScheme: string;
  lineWidth: number;
  showTitle: boolean;
  showStats: boolean;
  showElevation: boolean;
  paperSize: string;
  orientation: string;
  highResolution: boolean;
}

export interface ApiResponse {
  imageUrl: string;
  pdfUrl: string;
  metadata: {
    distance: number;
    elevation: number;
    duration: string;
    date: string;
    title: string;
  };
}
