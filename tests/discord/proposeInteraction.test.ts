import { describe, expect, it } from "vitest";
import {
  buildProposeButtonRow,
  buildProposeModal,
  parseProposeButtonId,
  parseProposeModalId,
  PROPOSE_MODAL_TITLE_INPUT_ID,
} from "../../src/discord/proposeInteraction";

describe("buildProposeButtonRow", () => {
  it("encodes the event id into the button's customId", () => {
    const row = buildProposeButtonRow("event-123");
    const button = row.components[0];

    expect(parseProposeButtonId(button.data.custom_id!)).toBe("event-123");
    expect(button.data.label).toMatch(/Propose a Movie/);
  });
});

describe("parseProposeButtonId", () => {
  it("returns null for a customId from a different component", () => {
    expect(parseProposeButtonId("mn-propose-modal:event-123")).toBeNull();
    expect(parseProposeButtonId("something-else")).toBeNull();
  });
});

describe("buildProposeModal", () => {
  it("encodes the event id into the modal's customId and has a title input", () => {
    const modal = buildProposeModal("event-123");
    expect(parseProposeModalId(modal.data.custom_id!)).toBe("event-123");

    const row = modal.components[0];
    const input = row.components[0];
    expect(input.data.custom_id).toBe(PROPOSE_MODAL_TITLE_INPUT_ID);
  });
});

describe("parseProposeModalId", () => {
  it("returns null for a customId from a different component", () => {
    expect(parseProposeModalId("mn-propose:event-123")).toBeNull();
    expect(parseProposeModalId("something-else")).toBeNull();
  });
});
