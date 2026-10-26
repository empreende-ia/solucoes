"use client";

// Store zustand do builder novo (porte do protótipo zapflow/src/store.ts).
// Diferenças vs protótipo:
//   - flow inicial é null (carregado do backend via loadFlow) + reset().
//   - cada mutação persistível bumpa `rev` e marca `saveMode`
//     ("structural" → flush imediato do autosave; "config" → debounce 1s).
//   - insertStep de "interactive" remove as branches locked (Not Delivered/
//     Timeout) — sem suporte no executor v1; a pergunta fica só botões + else.
//   - updateStep no-op não empurra snapshot de undo (identidade preservada
//     pelas operations).

import { create } from "zustand";
import {
  addBranch,
  addStep,
  deleteStep,
  findStep,
  setGotoTarget,
  updateStep,
  updateTrigger,
} from "@/lib/builder/flow/operations";
import type { StepPatch } from "@/lib/builder/flow/operations";
import { TRIGGER_ID } from "@/lib/builder/flow/layout";
import type { Flow, FlowTriggerType, Slot, StepType } from "@/lib/builder/flow/types";

const MAX_HISTORY = 50;

/** Id de seleção do trigger no painel de config (o trigger não é um Step). */
export const TRIGGER_SELECTION_ID = TRIGGER_ID;

export type SaveMode = "structural" | "config";

export interface PickerState {
  slot: Slot;
  x: number;
  y: number;
}

interface FlowBuilderStore {
  flow: Flow | null;
  past: Flow[]; // undo por snapshot, até 50
  /** bump a cada mutação persistível — o hook de autosave observa isto */
  rev: number;
  saveMode: SaveMode;
  selectedStepId: string | null;
  picker: PickerState | null;
  pickingGotoId: string | null;

  loadFlow: (flow: Flow) => void;
  reset: () => void;

  select: (id: string | null) => void;
  openPicker: (slot: Slot, pos: { x: number; y: number }) => void;
  closePicker: () => void;
  insertStep: (type: StepType) => void;
  removeStep: (id: string) => void;
  patchStep: (id: string, patch: StepPatch) => void;
  patchTrigger: (patch: {
    type?: FlowTriggerType;
    label?: string;
    keywords?: string[];
    campaignId?: string | null;
    campaignName?: string | null;
    replyFilter?: string;
  }) => void;
  addBranchTo: (id: string) => void;
  renameFlow: (name: string) => void;
  startGotoPick: (id: string) => void;
  cancelGotoPick: () => void;
  chooseGotoTarget: (targetId: string) => void;
  undo: () => void;
}

const pushPast = (past: Flow[], flow: Flow): Flow[] => [
  ...past.slice(-(MAX_HISTORY - 1)),
  flow,
];

export const useFlowBuilderStore = create<FlowBuilderStore>((set, get) => ({
  flow: null,
  past: [],
  rev: 0,
  saveMode: "config",
  selectedStepId: null,
  picker: null,
  pickingGotoId: null,

  loadFlow: (flow) =>
    set({
      flow,
      past: [],
      rev: 0,
      selectedStepId: null,
      picker: null,
      pickingGotoId: null,
    }),

  reset: () =>
    set({
      flow: null,
      past: [],
      rev: 0,
      selectedStepId: null,
      picker: null,
      pickingGotoId: null,
    }),

  select: (id) => set({ selectedStepId: id, picker: null }),

  openPicker: (slot, pos) => set({ picker: { slot, x: pos.x, y: pos.y } }),
  closePicker: () => set({ picker: null }),

  insertStep: (type) => {
    const { flow, picker, past, rev } = get();
    if (!flow || !picker) return;
    const res = addStep(flow, { type, slot: picker.slot });
    if (res.flow === flow) {
      // no-op da operação (ex.: terminal em slot com cauda) → não polui o undo
      set({ picker: null });
      return;
    }
    let nextFlow = res.flow;
    if (type === "interactive") {
      // v1: sem branches locked (Not Delivered/Timeout) — só botões + else.
      const created = findStep(nextFlow, res.stepId);
      if (created?.branches?.some((b) => b.locked)) {
        nextFlow = updateStep(nextFlow, res.stepId, {
          branches: created.branches.filter((b) => !b.locked),
        });
      }
    }
    set({
      flow: nextFlow,
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "structural",
      picker: null,
      selectedStepId: res.stepId,
    });
  },

  removeStep: (id) => {
    const { flow, past, rev, selectedStepId } = get();
    if (!flow) return;
    set({
      flow: deleteStep(flow, id),
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "structural",
      selectedStepId: selectedStepId === id ? null : selectedStepId,
    });
  },

  patchStep: (id, patch) => {
    const { flow, past, rev } = get();
    if (!flow) return;
    const next = updateStep(flow, id, patch);
    if (next === flow) return; // no-op: nada mudou no step → não gasta undo
    set({
      flow: next,
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "config",
    });
  },

  patchTrigger: (patch) => {
    const { flow, past, rev } = get();
    if (!flow) return;
    const next = updateTrigger(flow, patch);
    if (next === flow) return; // no-op
    set({
      flow: next,
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "config",
    });
  },

  addBranchTo: (id) => {
    const { flow, past, rev } = get();
    if (!flow) return;
    set({
      flow: addBranch(flow, id),
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "structural",
    });
  },

  renameFlow: (name) => {
    const { flow, past, rev } = get();
    if (!flow || flow.name === name) return;
    set({
      flow: { ...flow, name },
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "config",
    });
  },

  startGotoPick: (id) => set({ pickingGotoId: id, picker: null }),
  cancelGotoPick: () => set({ pickingGotoId: null }),

  chooseGotoTarget: (targetId) => {
    const { flow, past, rev, pickingGotoId } = get();
    if (!flow || !pickingGotoId || targetId === pickingGotoId) return;
    set({
      flow: setGotoTarget(flow, pickingGotoId, targetId),
      past: pushPast(past, flow),
      rev: rev + 1,
      saveMode: "structural",
      pickingGotoId: null,
    });
  },

  undo: () => {
    const { past, rev, selectedStepId } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      flow: prev,
      past: past.slice(0, -1),
      rev: rev + 1,
      saveMode: "structural",
      selectedStepId:
        selectedStepId &&
        (selectedStepId === TRIGGER_SELECTION_ID || findStep(prev, selectedStepId))
          ? selectedStepId
          : null,
      picker: null,
      pickingGotoId: null,
    });
  },
}));
