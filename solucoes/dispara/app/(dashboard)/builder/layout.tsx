"use client";

import "@xyflow/react/dist/style.css";
import "@/components/flow-builder/flow-builder.css";

import type { ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { PageLayoutScope } from "@/components/providers/PageLayoutProvider";

type BuilderLayoutProps = {
  children: ReactNode;
};

export default function BuilderLayout({ children }: BuilderLayoutProps) {
  return (
    <PageLayoutScope
      value={{
        width: "full",
        overflow: "hidden",
        padded: false,
        height: "full",
        showAccountAlerts: false,
      }}
    >
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </PageLayoutScope>
  );
}
