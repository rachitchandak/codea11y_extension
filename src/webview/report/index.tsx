import React from "react";
import { createRoot } from "react-dom/client";
import ReportPanel from "./ReportPanel";
import "../shared/globals.css";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(<ReportPanel />);
