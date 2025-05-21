
import React from "react";

const Footer = () => {
  return (
    <footer className="border-t mt-16">
      <div className="container py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} GPX Poster Creator. Based on{" "}
              <a
                href="https://github.com/ThomasParistech/pretty-gpx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gpx-primary hover:underline"
              >
                pretty-gpx
              </a>
            </p>
          </div>
          <div className="flex gap-6">
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Terms of Service
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
