
import React from "react";
import { Route } from "lucide-react";
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="border-b">
      <div className="container flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Route className="h-6 w-6 text-gpx-primary" />
          <h1 className="text-2xl font-bold">GPX Poster Creator</h1>
        </div>
        <nav>
          <ul className="flex gap-6">
            <li>
              <Link to="/" className="text-sm font-medium hover:text-gpx-primary">
                Home
              </Link>
            </li>
            <li>
              <Link to="/race-organizer" className="text-sm font-medium hover:text-gpx-primary">
                Race Organizer
              </Link>
            </li>
            <li>
              <a href="#" className="text-sm font-medium hover:text-gpx-primary">
                Gallery
              </a>
            </li>
            <li>
              <a href="#" className="text-sm font-medium hover:text-gpx-primary">
                About
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
