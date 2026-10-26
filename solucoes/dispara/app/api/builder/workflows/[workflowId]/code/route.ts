import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ workflowId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  return NextResponse.json({
    code: `export async function workflow${workflowId}() {\n  "use workflow";\n}\n`,
    workflowName: "Workflow",
  });
}
