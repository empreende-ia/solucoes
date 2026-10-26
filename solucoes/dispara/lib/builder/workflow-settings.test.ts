import { describe, expect, it } from "vitest";
import {
  parseWorkflowSettings,
  timeWindowDelayMs,
  type WorkflowTimeWindow,
} from "./workflow-settings";

// Datas fixas em UTC para determinismo (timezone da janela = UTC nos testes).
// 2026-07-06 é uma segunda-feira.
const monday10h = new Date("2026-07-06T10:00:00Z");
const monday20h = new Date("2026-07-06T20:00:00Z");
const saturday12h = new Date("2026-07-11T12:00:00Z");

function window(partial?: Partial<WorkflowTimeWindow>): WorkflowTimeWindow {
  return {
    enabled: true,
    start: "09:00",
    end: "18:00",
    days: [1, 2, 3, 4, 5],
    timezone: "UTC",
    ...partial,
  };
}

describe("timeWindowDelayMs", () => {
  it("retorna 0 dentro da janela", () => {
    expect(timeWindowDelayMs(window(), monday10h)).toBe(0);
  });

  it("retorna 0 quando desativada ou ausente", () => {
    expect(timeWindowDelayMs(undefined, monday20h)).toBe(0);
    expect(timeWindowDelayMs(window({ enabled: false }), monday20h)).toBe(0);
  });

  it("fora da janela no mesmo dia: espera até a abertura de amanhã", () => {
    // Segunda 20:00 → terça 09:00 = 13h
    expect(timeWindowDelayMs(window(), monday20h)).toBe(13 * 60 * 60_000);
  });

  it("dia inativo: espera até o próximo dia ativo", () => {
    // Sábado 12:00 → segunda 09:00 = 45h
    expect(timeWindowDelayMs(window(), saturday12h)).toBe(45 * 60 * 60_000);
  });

  it("antes da abertura no mesmo dia: espera só até a abertura", () => {
    const monday7h = new Date("2026-07-06T07:00:00Z");
    expect(timeWindowDelayMs(window(), monday7h)).toBe(2 * 60 * 60_000);
  });

  it("janela invertida (end <= start) não bloqueia", () => {
    expect(
      timeWindowDelayMs(window({ start: "18:00", end: "09:00" }), monday20h)
    ).toBe(0);
  });

  it("sem nenhum dia ativo não bloqueia (senão travaria para sempre)", () => {
    expect(timeWindowDelayMs(window({ days: [] }), monday20h)).toBe(0);
  });

  it("fuso inválido não bloqueia", () => {
    expect(
      timeWindowDelayMs(window({ timezone: "Invalid/Zone" }), monday20h)
    ).toBe(0);
  });
});

describe("parseWorkflowSettings", () => {
  it("sanitiza o shape completo", () => {
    const parsed = parseWorkflowSettings({
      allowReentry: false,
      stopOnResponse: true,
      timeWindow: {
        enabled: true,
        start: "09:00",
        end: "18:30",
        days: [5, 1, 1, 9, -1, "3"],
        timezone: "  America/Sao_Paulo ",
      },
      lixo: "ignorado",
    });
    expect(parsed).toEqual({
      allowReentry: false,
      stopOnResponse: true,
      timeWindow: {
        enabled: true,
        start: "09:00",
        end: "18:30",
        days: [1, 3, 5],
        timezone: "America/Sao_Paulo",
      },
    });
  });

  it("descarta timeWindow com horários inválidos", () => {
    const parsed = parseWorkflowSettings({
      timeWindow: { enabled: true, start: "25:99", end: "18:00", days: [1] },
    });
    expect(parsed.timeWindow).toBeUndefined();
  });

  it("aceita entrada nula/não-objeto", () => {
    expect(parseWorkflowSettings(null)).toEqual({});
    expect(parseWorkflowSettings("x")).toEqual({});
  });
});
