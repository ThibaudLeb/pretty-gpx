
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CsvUpload from "@/components/race-organizer/CsvUpload";
import EmailCampaign from "@/components/race-organizer/EmailCampaign";
import GmailSetup from "@/components/race-organizer/GmailSetup";
import { RacerData } from "@/types/race-organizer";

const RaceOrganizer = () => {
  const [racerData, setRacerData] = useState<RacerData[]>([]);
  const [gpxFile, setGpxFile] = useState<File | null>(null);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Race Organizer Dashboard
          </h1>
          <p className="text-xl text-muted-foreground">
            Send personalized GPX posters to your race attendees via Gmail
          </p>
        </div>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">Gmail Setup</TabsTrigger>
            <TabsTrigger value="data">Upload Data & GPX</TabsTrigger>
            <TabsTrigger value="campaign">Email Campaign</TabsTrigger>
          </TabsList>
          
          <TabsContent value="setup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Configure Gmail Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <GmailSetup />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="data" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Upload Racer Data & GPX File</CardTitle>
              </CardHeader>
              <CardContent>
                <CsvUpload 
                  onDataLoaded={setRacerData} 
                  onGpxUploaded={setGpxFile}
                  racerCount={racerData.length}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="campaign" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Step 3: Send Gmail Campaign</CardTitle>
              </CardHeader>
              <CardContent>
                <EmailCampaign 
                  racerData={racerData}
                  gpxFile={gpxFile}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RaceOrganizer;
