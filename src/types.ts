
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

export interface ProcessedPoster {
  id: string;
  created_at: string;
  original_filename: string;
  image_url: string;
  pdf_url: string;
  title: string;
  distance: number;
  elevation: number;
  duration: string;
  date: string;
  options: PosterOptions;
  status: 'processing' | 'completed' | 'error';
}
