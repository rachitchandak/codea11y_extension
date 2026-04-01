import React from "react";
import { createRoot } from "react-dom/client";
import SidebarApp from "./SidebarApp";
import "../shared/globals.css";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(<SidebarApp />);
