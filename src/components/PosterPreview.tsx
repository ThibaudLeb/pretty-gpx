
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PosterPreviewProps {
  imageUrl?: string;
  loading?: boolean;
}

const PosterPreview = ({ imageUrl, loading = false }: PosterPreviewProps) => {
  return (
    <Card className="w-full overflow-hidden poster-shadow">
      <CardContent className="p-4 flex justify-center">
        {loading ? (
          <Skeleton className="w-full h-[400px] md:h-[500px] rounded-md" />
        ) : imageUrl ? (
          <div className="w-full flex justify-center">
            <img 
              src={imageUrl} 
              alt="GPX Poster Preview" 
              className="max-h-[500px] object-contain"
            />
          </div>
        ) : (
          <div className="w-full h-[400px] md:h-[500px] flex items-center justify-center bg-slate-100 rounded-md">
            <p className="text-muted-foreground">
              Your poster preview will appear here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PosterPreview;
