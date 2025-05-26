
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, Users, MapPin } from "lucide-react";
import { toast } from "sonner";
import { RacerData } from "@/types/race-organizer";
import FileUpload from "@/components/FileUpload";

interface CsvUploadProps {
  onDataLoaded: (data: RacerData[]) => void;
  onGpxUploaded: (file: File) => void;
  racerCount: number;
}

const CsvUpload = ({ onDataLoaded, onGpxUploaded, racerCount }: CsvUploadProps) => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error("Please upload a CSV file");
      return;
    }

    setCsvFile(file);
    processCsvFile(file);
  };

  const processCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const lines = content.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Validate required headers
        const requiredHeaders = [
          'First Name', 'Last Name', 'Email', 'Ranking', 'Race', 
          'Duration', 'Race Km', 'Race Elevation', 'Race name'
        ];
        
        const missingHeaders = requiredHeaders.filter(req => 
          !headers.some(h => h.toLowerCase() === req.toLowerCase())
        );
        
        if (missingHeaders.length > 0) {
          toast.error(`Missing required columns: ${missingHeaders.join(', ')}`);
          return;
        }

        const racers: RacerData[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          if (values.length < headers.length) continue;
          
          const racer: RacerData = {
            firstName: getValue(headers, values, 'First Name'),
            lastName: getValue(headers, values, 'Last Name'),
            email: getValue(headers, values, 'Email'),
            ranking: parseInt(getValue(headers, values, 'Ranking')) || 0,
            race: getValue(headers, values, 'Race'),
            duration: getValue(headers, values, 'Duration'),
            raceKm: parseFloat(getValue(headers, values, 'Race Km')) || 0,
            raceElevation: parseFloat(getValue(headers, values, 'Race Elevation')) || 0,
            raceName: getValue(headers, values, 'Race name'),
          };
          
          racers.push(racer);
        }
        
        onDataLoaded(racers);
        toast.success(`Loaded ${racers.length} racers from CSV`);
      } catch (error) {
        console.error("Error parsing CSV:", error);
        toast.error("Error parsing CSV file");
      }
    };
    reader.readAsText(file);
  };

  const getValue = (headers: string[], values: string[], columnName: string): string => {
    const index = headers.findIndex(h => h.toLowerCase() === columnName.toLowerCase());
    return index >= 0 ? values[index] : '';
  };

  const handleGpxFileSelected = (file: File) => {
    setGpxFile(file);
    onGpxUploaded(file);
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* CSV Upload */}
        <Card className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-blue-50 p-3">
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium">Upload Racer Data</h3>
              <p className="text-sm text-muted-foreground">
                CSV file with racer information
              </p>
            </div>
            <Button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              {csvFile ? 'Change CSV File' : 'Select CSV File'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            {csvFile && (
              <p className="text-sm text-green-600">
                ✓ {csvFile.name}
              </p>
            )}
          </div>
        </Card>

        {/* GPX Upload */}
        <Card className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-green-50 p-3">
              <MapPin className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium">Upload Race GPX</h3>
              <p className="text-sm text-muted-foreground">
                GPX file of the race route
              </p>
            </div>
            <div className="w-full">
              <FileUpload onFileSelected={handleGpxFileSelected} />
            </div>
            {gpxFile && (
              <p className="text-sm text-green-600">
                ✓ {gpxFile.name}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Status */}
      {racerCount > 0 && (
        <Card className="p-4">
          <div className="flex items-center space-x-4">
            <Users className="h-5 w-5 text-blue-500" />
            <div>
              <p className="font-medium">Ready to process</p>
              <p className="text-sm text-muted-foreground">
                {racerCount} racers loaded, GPX file: {gpxFile ? '✓' : '✗'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Sample CSV Format */}
      <Card className="p-4">
        <h4 className="font-medium mb-2">Required CSV Format:</h4>
        <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded font-mono overflow-x-auto">
          First Name,Last Name,Email,Ranking,Race,Duration,Race Km,Race Elevation,Race name<br/>
          John,Doe,john@example.com,1,Trail Run,1h 30m,15.5,800,Mountain Trail Challenge
        </div>
      </Card>
    </div>
  );
};

export default CsvUpload;
