import React from "react";
import { createRoot } from "react-dom/client";
import ReportView from "./ReportView";
import "../shared/globals.css";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(<ReportView />);
