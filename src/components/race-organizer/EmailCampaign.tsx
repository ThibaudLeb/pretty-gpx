
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Mail, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { RacerData, CampaignProgress } from "@/types/race-organizer";
import { supabase } from "@/integrations/supabase/client";

interface EmailCampaignProps {
  racerData: RacerData[];
  gpxFile: File | null;
}

const EmailCampaign = ({ racerData, gpxFile }: EmailCampaignProps) => {
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPassword, setSenderPassword] = useState("");
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

  const canStartCampaign = racerData.length > 0 && gpxFile && senderEmail && senderPassword;

  const startEmailCampaign = async () => {
    if (!canStartCampaign) {
      toast.error("Please complete all required fields");
      return;
    }

    setProgress({
      total: racerData.length,
      completed: 0,
      failed: 0,
      status: 'processing'
    });

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
            senderEmail,
            senderPassword,
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
        status: 'completed'
      }));

      toast.success(`Email campaign completed! Sent ${data.successful} emails successfully.`);
      
      if (data.failed > 0) {
        toast.error(`${data.failed} emails failed to send. Check the logs for details.`);
      }

    } catch (error) {
      console.error("Error starting email campaign:", error);
      setProgress(prev => ({
        ...prev,
        status: 'error'
      }));
      toast.error("Failed to start email campaign");
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

  const progressPercentage = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

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
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="senderEmail">Sender Gmail Address</Label>
                  <Input
                    id="senderEmail"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="your.email@gmail.com"
                  />
                </div>
                <div>
                  <Label htmlFor="senderPassword">Gmail App Password</Label>
                  <Input
                    id="senderPassword"
                    type="password"
                    value={senderPassword}
                    onChange={(e) => setSenderPassword(e.target.value)}
                    placeholder="Your Gmail app password"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Generate an app password in your Gmail security settings
                  </p>
                </div>
              </div>
              
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
                  <span>{progress.completed}/{progress.total}</span>
                </div>
                <Progress value={progressPercentage} className="w-full" />
                {progress.currentRacer && (
                  <p className="text-sm text-muted-foreground">
                    Processing: {progress.currentRacer}
                  </p>
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

            {!senderEmail && (
              <p className="text-sm text-amber-600 mt-2">
                ⚠️ Please enter your Gmail credentials to send emails
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default EmailCampaign;
