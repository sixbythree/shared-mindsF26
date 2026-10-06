const REPLICATE_PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const MODEL = "google/nano-banana-2";

const form = document.querySelector("#prompt-form");
const promptInput = document.querySelector("#prompt");
const generateButton = document.querySelector("#generate-button");
const buttonLabel = generateButton.querySelector(".button-label");
const statusMessage = document.querySelector("#status");
const results = document.querySelector("#results");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }

  setLoading(true);
  setStatus("Sending your prompt to Nano Banana 2…");
  results.replaceChildren();

  try {
    const response = await fetch(REPLICATE_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: { prompt },
      }),
    });

    const prediction = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(getErrorMessage(prediction, response.status));
    }

    const imageUrls = getImageUrls(prediction);
    if (imageUrls.length === 0) {
      throw new Error(getErrorMessage(prediction) || "The model response did not include an image.");
    }

    renderImages(imageUrls, prompt);
    setStatus(imageUrls.length === 1 ? "Your image is ready." : `${imageUrls.length} images are ready.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Something went wrong. Please try again.", "error");
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  promptInput.disabled = isLoading;
  buttonLabel.textContent = isLoading ? "Generating…" : "Generate image";
}

function setStatus(message, kind = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = kind;
}

function getImageUrls(prediction) {
  const output = prediction?.output;
  const values = Array.isArray(output) ? output : [output];
  return values
    .map((value) => (typeof value === "string" ? value : value?.url))
    .filter((value) => typeof value === "string" && /^https?:\/\//i.test(value));
}

function getErrorMessage(payload, statusCode) {
  const detail = payload?.detail ?? payload?.error;
  const message = typeof detail === "string" ? detail : detail?.message;
  if (message) return message;
  if (statusCode) return `The image request failed (HTTP ${statusCode}). Please try again.`;
  return payload?.status === "failed" ? "The model could not generate that image. Try another prompt." : "";
}

function renderImages(imageUrls, prompt) {
  for (const [index, url] of imageUrls.entries()) {
    const figure = document.createElement("figure");
    figure.className = "result-card";

    const image = document.createElement("img");
    image.src = url;
    image.alt = `Generated image for: ${prompt}`;
    image.loading = "lazy";
    figure.append(image);

    const caption = document.createElement("figcaption");
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Open image ${index + 1} in a new tab`;
    caption.append(link);
    figure.append(caption);
    results.append(figure);
  }
}
