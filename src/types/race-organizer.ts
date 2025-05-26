
export interface RacerData {
  firstName: string;
  lastName: string;
  email: string;
  ranking: number;
  race: string;
  duration: string;
  raceKm: number;
  raceElevation: number;
  raceName: string;
}

export interface EmailCampaignRequest {
  racerData: RacerData[];
  gpxFile: File;
  emailTemplate: {
    subject: string;
    bodyTemplate: string;
  };
  senderEmail: string;
  posterOptions: {
    template: string;
    colorScheme: string;
    showRacerInfo: boolean;
  };
}

export interface CampaignProgress {
  total: number;
  completed: number;
  failed: number;
  currentRacer?: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
}
