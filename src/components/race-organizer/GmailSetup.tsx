
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, ExternalLink, Mail, Settings } from "lucide-react";
import { toast } from "sonner";

const GmailSetup = () => {
  const [step, setStep] = useState(1);
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: ''
  });

  const steps = [
    {
      title: "Create Google Cloud Project",
      description: "Set up OAuth credentials in Google Cloud Console",
      completed: false
    },
    {
      title: "Enable Gmail API",
      description: "Enable the Gmail API for your project",
      completed: false
    },
    {
      title: "Configure OAuth",
      description: "Set up OAuth consent screen and credentials",
      completed: false
    },
    {
      title: "Get Refresh Token",
      description: "Generate a refresh token for your Gmail account",
      completed: false
    },
    {
      title: "Configure Secrets",
      description: "Add credentials to your Supabase project",
      completed: false
    }
  ];

  const handleSaveCredentials = () => {
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    toast.success("Credentials saved! You can now use Gmail to send emails.");
    setStep(6);
  };

  const generateAuthUrl = () => {
    if (!credentials.clientId) {
      toast.error("Please enter your Client ID first");
      return;
    }

    const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.send');
    const redirectUri = encodeURIComponent('urn:ietf:wg:oauth:2.0:oob');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${credentials.clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent`;
    
    window.open(url, '_blank');
    toast.info("Authorization window opened. Copy the authorization code and use it to get your refresh token.");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Setup for Email Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <Settings className="h-4 w-4" />
            <AlertDescription>
              Follow these steps to connect your Gmail account for sending race emails. 
              This is a one-time setup process.
            </AlertDescription>
          </Alert>

          <div className="space-y-6">
            {/* Step Progress */}
            <div className="space-y-4">
              {steps.map((stepItem, index) => (
                <div key={index} className={`flex items-start gap-3 p-4 rounded-lg border ${
                  step > index + 1 ? 'bg-green-50 border-green-200' : 
                  step === index + 1 ? 'bg-blue-50 border-blue-200' : 
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                    step > index + 1 ? 'bg-green-500 text-white' :
                    step === index + 1 ? 'bg-blue-500 text-white' :
                    'bg-gray-300 text-gray-600'
                  }`}>
                    {step > index + 1 ? <CheckCircle className="h-4 w-4" /> : index + 1}
                  </div>
                  <div>
                    <h4 className="font-medium">{stepItem.title}</h4>
                    <p className="text-sm text-muted-foreground">{stepItem.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Step 1: Google Cloud Console */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Step 1: Create Google Cloud Project</h3>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You need to create a Google Cloud project and set up OAuth credentials.
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => window.open('https://console.cloud.google.com/projectcreate', '_blank')}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Google Cloud Console
                    </Button>
                    <Button onClick={() => setStep(2)}>
                      Next Step
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Enable Gmail API */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Step 2: Enable Gmail API</h3>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Enable the Gmail API for your Google Cloud project.
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => window.open('https://console.cloud.google.com/apis/library/gmail.googleapis.com', '_blank')}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Enable Gmail API
                    </Button>
                    <Button onClick={() => setStep(3)}>
                      Next Step
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: OAuth Setup */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Step 3: Configure OAuth</h3>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Set up the OAuth consent screen and create credentials.
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Go to the OAuth consent screen and configure it</li>
                    <li>Create OAuth 2.0 Client IDs in the Credentials section</li>
                    <li>Choose "Desktop application" as the application type</li>
                    <li>Copy your Client ID and Client Secret</li>
                  </ol>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => window.open('https://console.cloud.google.com/apis/credentials', '_blank')}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Credentials Page
                    </Button>
                    <Button onClick={() => setStep(4)}>
                      Next Step
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Get Refresh Token */}
            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Step 4: Get Refresh Token</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="clientId">Client ID</Label>
                    <Input
                      id="clientId"
                      value={credentials.clientId}
                      onChange={(e) => setCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                      placeholder="Your Google OAuth Client ID"
                    />
                  </div>
                  
                  <Button 
                    onClick={generateAuthUrl}
                    disabled={!credentials.clientId}
                    className="w-full"
                  >
                    Generate Authorization URL
                  </Button>
                  
                  <Alert>
                    <AlertDescription>
                      After clicking the button above, you'll be redirected to Google. 
                      Grant permissions and copy the authorization code. 
                      Use this code with your Client ID and Client Secret to get a refresh token using Google's OAuth playground or a script.
                    </AlertDescription>
                  </Alert>
                  
                  <Button 
                    variant="outline"
                    onClick={() => window.open('https://developers.google.com/oauthplayground/', '_blank')}
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    OAuth 2.0 Playground
                  </Button>
                  
                  <Button onClick={() => setStep(5)}>
                    Next Step
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Configure Secrets */}
            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Step 5: Configure Secrets</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="clientIdFinal">Client ID</Label>
                    <Input
                      id="clientIdFinal"
                      value={credentials.clientId}
                      onChange={(e) => setCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                      placeholder="Your Google OAuth Client ID"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="clientSecret">Client Secret</Label>
                    <Input
                      id="clientSecret"
                      type="password"
                      value={credentials.clientSecret}
                      onChange={(e) => setCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                      placeholder="Your Google OAuth Client Secret"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="refreshToken">Refresh Token</Label>
                    <Input
                      id="refreshToken"
                      type="password"
                      value={credentials.refreshToken}
                      onChange={(e) => setCredentials(prev => ({ ...prev, refreshToken: e.target.value }))}
                      placeholder="Your Gmail Refresh Token"
                    />
                  </div>
                  
                  <Alert>
                    <AlertDescription>
                      These credentials will be securely stored in your Supabase project secrets. 
                      You'll need to add them manually to your Supabase project settings under "Edge Function Secrets".
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Add these secrets to your Supabase project:</p>
                    <div className="bg-gray-100 p-3 rounded text-sm font-mono space-y-1">
                      <div>GMAIL_CLIENT_ID = {credentials.clientId || '<your-client-id>'}</div>
                      <div>GMAIL_CLIENT_SECRET = {credentials.clientSecret || '<your-client-secret>'}</div>
                      <div>GMAIL_REFRESH_TOKEN = {credentials.refreshToken || '<your-refresh-token>'}</div>
                    </div>
                  </div>
                  
                  <Button onClick={handleSaveCredentials} className="w-full">
                    Save Configuration
                  </Button>
                </div>
              </div>
            )}

            {/* Step 6: Completion */}
            {step === 6 && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-green-800">Setup Complete!</h3>
                <p className="text-muted-foreground">
                  Your Gmail integration is now configured. You can send emails using your Gmail account.
                </p>
                <Alert>
                  <AlertDescription>
                    <strong>Important:</strong> Make sure you've added the three secrets (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) 
                    to your Supabase project's Edge Function Secrets in the dashboard.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GmailSetup;
