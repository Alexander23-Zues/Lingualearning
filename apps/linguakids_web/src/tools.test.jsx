import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AIManagement, ReadingPractice, Translator } from "./tools";
let app;
vi.mock("./context", () => ({ useApp: () => app }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  app = { repository: { api: vi.fn() }, data: { records: [], active_model: null } };
});
it("refreshes training runs after queuing exactly one job", async () => {
  app.data.records = [{ id: "fixture-dataset", kind: "dataset", status: "published", title: "Reviewed fixture dataset" }];
  app.repository.api.mockImplementation(async (_path, body) => body ? {} : []);
  render(<AIManagement />);
  await screen.findByText("No training jobs yet");
  fireEvent.click(screen.getByRole("button", { name: "Start training job" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Approved dataset" }), { target: { value: "fixture-dataset" } });
  app.repository.api.mockImplementation(async (_path, body) => body ? {} : [{ id: "fixture-new-job", status: "queued", configuration: { epochs: 1, batch_size: 2 } }]);
  fireEvent.submit(within(dialog).getByRole("button", { name: "Queue training job" }).closest("form"));
  await screen.findByText("Training run · fixture-");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  expect(app.repository.api.mock.calls.filter(([, body]) => body)).toEqual([
    ["/v1/ai/jobs", { dataset_record_id: "fixture-dataset", epochs: 1, batch_size: 2 }],
  ]);
});
it("removes an old translation when the input changes and keeps its language stable while translating", async () => {
  let finish;
  app.repository.api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Translator />);
  const input = screen.getByRole("textbox", { name: "Text to translate" });
  fireEvent.change(input, { target: { value: "A book." } });
  fireEvent.submit(screen.getByRole("button", { name: "Translate" }).closest("form"));
  expect(input.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Swap languages" }).disabled).toBe(true);
  finish({ translation: "Isang aklat." });
  await screen.findByText("Isang aklat.");
  fireEvent.change(input, { target: { value: "A tree." } });
  expect(screen.queryByText("Isang aklat.")).toBe(null);
});

afterEach(() => vi.unstubAllGlobals());
it("checks each part of a long reading against only its own recording", async () => {
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL() { return "blob:reading"; }
    static revokeObjectURL() {}
  });
  let microphone;
  vi.stubGlobal("AudioWorkletNode", class {
    port = {};
    constructor() { microphone = this; }
    connect(target) { return target; }
    disconnect() {}
  });
  vi.stubGlobal("AudioContext", class {
    sampleRate = 16000;
    audioWorklet = { addModule: async () => {} };
    destination = {};
    createMediaStreamSource() { return { connect: (target) => target }; }
    createBiquadFilter() { return { frequency: {}, Q: {}, connect: (target) => target }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async resume() {}
    async close() {}
  });

  app.repository.api.mockImplementation(async (_path, form) => ({
    transcript: form.get("expected_text"),
    matched_words: ["morning"],
    missing_words: [],
    word_results: [{ word: "morning", correct: true }],
  }));
  render(<ReadingPractice />);
  const text = screen.getByRole("textbox", { name: "Type the words you will read aloud" });
  expect(text.maxLength).toBe(3000);
  const passage = "Good morning everyone. ".repeat(20).trim();
  fireEvent.change(text, { target: { value: passage } });
  screen.getByText("Part 1 of 4");
  const record = async () => {
    fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
    const stop = await screen.findByRole("button", { name: "Stop recording" });
    microphone.port.onmessage({ data: new Float32Array(320).fill(0.12) });
    fireEvent.click(stop);
    fireEvent.click(screen.getByRole("button", { name: "Check my reading" }));
  };
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  const stop = await screen.findByRole("button", { name: "Stop recording" });
  microphone.port.onmessage({ data: new Float32Array(320) });
  fireEvent.click(stop);
  screen.getByText("No speech was recorded. Read aloud and try recording again.");
  expect(screen.getByRole("button", { name: "Check my reading" }).disabled).toBe(true);
  expect(screen.queryByText("Here's what we heard")).toBe(null);
  expect(app.repository.api).not.toHaveBeenCalled();

  await record();
  await screen.findByText("1 of 4 parts checked");
  const [path, form] = app.repository.api.mock.calls[0];
  expect(path).toBe("/v1/ai/reading");
  expect(form.get("expected_text")).toBe("Good morning everyone. ".repeat(6).trim());
  expect(form.get("audio").size).toBe(684);

  fireEvent.click(screen.getByRole("button", { name: "Record the next part" }));
  screen.getByText("Part 2 of 4");
  expect(screen.getByRole("button", { name: "Check my reading" }).disabled).toBe(true);
  expect(app.repository.api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Previous part" }));
  screen.getByText("Here's what we heard");

  fireEvent.change(text, { target: { value: "expectation" } });
  expect(screen.queryByText("Here's what we heard")).toBe(null);
  await record();
  await screen.findByText("expectation", { selector: ".reading-result p" });
  expect(app.repository.api.mock.calls[1][1].get("expected_text")).toBe("expectation");

  app.repository.api.mockResolvedValue({ recognition_status: "unclear", speech_detected: true });
  await record();
  await screen.findByText("The recording was hard to understand. Listen to it or move closer to the microphone and try again.");
  expect(screen.queryByText("Here's what we heard")).toBe(null);
  expect(screen.getByLabelText("Your reading recording")).toBeTruthy();
});
