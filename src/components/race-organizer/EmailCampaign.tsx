
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Mail, Send, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { RacerData, CampaignProgress } from "@/types/race-organizer";
import { supabase } from "@/integrations/supabase/client";

interface EmailCampaignProps {
  racerData: RacerData[];
  gpxFile: File | null;
}

const EmailCampaign = ({ racerData, gpxFile }: EmailCampaignProps) => {
  const [emailSubject, setEmailSubject] = useState("Your {raceName} Results & GPX Poster");
  const [emailTemplate, setEmailTemplate] = useState(
    `Hi {firstName},\n\nCongratulations on completing the {raceName}!\n\nHere are your race results:\n• Ranking: #{ranking}\n• Duration: {duration}\n• Distance: {raceKm} km\n• Elevation: {raceElevation} m\n\nWe've attached a personalized GPX poster of your race route.\n\nThank you for participating!\n\nBest regards,\nRace Organization Team`
  );
  const [posterTemplate, setPosterTemplate] = useState("standard");
  const [colorScheme, setColorScheme] = useState("default");
  const [progress, setProgress] = useState<CampaignProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    status: 'idle'
  });
  const [campaignResults, setCampaignResults] = useState<{
    successful: number;
    failed: number;
    failedEmails: string[];
  } | null>(null);

  const canStartCampaign = racerData.length > 0 && gpxFile;

  const startEmailCampaign = async () => {
    if (!canStartCampaign) {
      toast.error("Please upload racer data and GPX file first");
      return;
    }

    setProgress({
      total: racerData.length,
      completed: 0,
      failed: 0,
      status: 'processing'
    });
    setCampaignResults(null);

    try {
      console.log("Starting email campaign for", racerData.length, "racers");

      const { data, error } = await supabase.functions.invoke('send-race-emails', {
        body: {
          racerData,
          gpxFile: {
            name: gpxFile.name,
            content: await fileToBase64(gpxFile)
          },
          emailConfig: {
            subject: emailSubject,
            template: emailTemplate
          },
          posterOptions: {
            template: posterTemplate,
            colorScheme: colorScheme,
            showTitle: true,
            showStats: true,
            showElevation: true,
            paperSize: "a4",
            orientation: "portrait",
            highResolution: false,
            showRacerInfo: true
          }
        }
      });

      if (error) {
        throw error;
      }

      setProgress(prev => ({
        ...prev,
        completed: data.successful,
        failed: data.failed,
        status: 'completed'
      }));

      setCampaignResults({
        successful: data.successful,
        failed: data.failed,
        failedEmails: data.failedEmails || []
      });

      toast.success(`Email campaign completed! Sent ${data.successful} emails successfully.`);
      
      if (data.failed > 0) {
        toast.error(`${data.failed} emails failed to send. Check the results below for details.`);
      }

    } catch (error) {
      console.error("Error starting email campaign:", error);
      setProgress(prev => ({
        ...prev,
        status: 'error'
      }));
      toast.error(`Failed to start email campaign: ${error.message}`);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data:application/... prefix
      };
      reader.onerror = error => reject(error);
    });
  };

  const progressPercentage = progress.total > 0 ? ((progress.completed + progress.failed) / progress.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {racerData.length === 0 || !gpxFile ? (
        <Card className="p-6">
          <div className="flex items-center space-x-3 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            <p>Please upload racer data and GPX file first</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Email Configuration */}
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4">Email Configuration</h3>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="emailSubject">Email Subject</Label>
                <Input
                  id="emailSubject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Your race results..."
                />
              </div>
              
              <div>
                <Label htmlFor="emailTemplate">Email Template</Label>
                <Textarea
                  id="emailTemplate"
                  value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                  rows={8}
                  placeholder="Your email content..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use placeholders: {`{firstName}, {lastName}, {ranking}, {duration}, {raceKm}, {raceElevation}, {raceName}`}
                </p>
              </div>
            </div>
          </Card>

          {/* Poster Configuration */}
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4">Poster Configuration</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="posterTemplate">Poster Template</Label>
                <Select value={posterTemplate} onValueChange={setPosterTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                    <SelectItem value="topographic">Topographic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="colorScheme">Color Scheme</Label>
                <Select value={colorScheme} onValueChange={setColorScheme}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select color scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Campaign Status */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Campaign Status</h3>
              <div className="flex items-center space-x-2">
                <Mail className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-muted-foreground">
                  {racerData.length} recipients
                </span>
              </div>
            </div>

            {progress.status !== 'idle' && (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{progress.completed + progress.failed}/{progress.total}</span>
                </div>
                <Progress value={progressPercentage} className="w-full" />
                {progress.status === 'processing' && (
                  <p className="text-sm text-blue-600">
                    Processing emails... This may take a few minutes.
                  </p>
                )}
              </div>
            )}

            {campaignResults && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {campaignResults.successful} emails sent successfully
                  </span>
                </div>
                {campaignResults.failed > 0 && (
                  <div className="flex items-center space-x-2 text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {campaignResults.failed} emails failed
                    </span>
                  </div>
                )}
                {campaignResults.failedEmails.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      Show failed emails
                    </summary>
                    <ul className="mt-2 list-disc list-inside text-red-600">
                      {campaignResults.failedEmails.map((email, index) => (
                        <li key={index}>{email}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <Button
              onClick={startEmailCampaign}
              disabled={!canStartCampaign || progress.status === 'processing'}
              className="w-full"
              size="lg"
            >
              <Send className="h-4 w-4 mr-2" />
              {progress.status === 'processing' 
                ? 'Sending Emails...' 
                : `Send ${racerData.length} Personalized Emails`
              }
            </Button>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This will generate personalized GPX posters for each racer and send them via email with their race results. Make sure you have configured the RESEND_API_KEY in your Supabase project settings.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default EmailCampaign;
