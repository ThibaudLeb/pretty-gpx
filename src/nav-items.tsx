
import { HomeIcon, Users } from "lucide-react";
import Index from "./pages/Index";
import RaceOrganizer from "./pages/RaceOrganizer";

export const navItems = [
  {
    title: "GPX Poster Generator",
    to: "/",
    icon: <HomeIcon className="h-4 w-4" />,
    page: <Index />,
  },
  {
    title: "Race Organizer",
    to: "/race-organizer",
    icon: <Users className="h-4 w-4" />,
    page: <RaceOrganizer />,
  },
];
