export type ImageInput = { prompt: string; photo?: { mimeType: string; data: string } };
export type ImageOutput = { mimeType: string; data: Uint8Array };
export type ImageGenerator = (input: ImageInput) => Promise<ImageOutput>;

export const MOD_STYLES = [
  "widebody",
  "stance",
  "rally",
  "track",
  "matte_wrap",
  "chrome_delete",
  "offroad",
  "retro",
  "custom",
] as const;
export type ModStyle = (typeof MOD_STYLES)[number];

const STUDIO = "in a clean photo studio with soft, even overhead lighting and a polished concrete floor";
const STREET = "parked on an empty city street at dusk with soft ambient light";

const PRESETS: Record<Exclude<ModStyle, "custom">, { mods: string; scene: string }> = {
  widebody: {
    mods: "a full widebody kit: bolted fender flares with visible rivets, a wider track, deep front splitter, side skirts, a ducktail rear spoiler, staggered deep-concave forged wheels and a lowered ride height on coilovers",
    scene: STUDIO,
  },
  stance: {
    mods: "a stance build: slammed on air suspension so the tyres tuck just under the arches, subtle negative camber, polished multi-piece deep-dish wheels with stretched tyres and shaved, clean body details",
    scene: STREET,
  },
  rally: {
    mods: "a rally build: raised gravel suspension, mud flaps, a roof scoop, a four-lamp light pod on the bonnet, white multi-spoke gravel wheels with chunky tyres, a clean livery with racing stripes and door numbers, a light layer of dust on the lower panels",
    scene: "on a gravel forest stage with dust in the air and late afternoon sun",
  },
  track: {
    mods: "a track-day build: carbon fibre bonnet and front splitter, a large adjustable rear wing, lightweight forged wheels with semi-slick tyres, a big brake kit with coloured calipers, red tow hooks and a lowered, aggressive stance",
    scene: "in the pit lane of a race circuit on a bright overcast day",
  },
  matte_wrap: {
    mods: "a satin matte vinyl wrap with gloss black accents and tinted windows, otherwise factory stock",
    scene: STUDIO,
  },
  chrome_delete: {
    mods: "a full chrome delete: every chrome trim piece, badge, window surround and grille accent in gloss black, dark tinted windows and gloss black wheels",
    scene: STREET,
  },
  offroad: {
    mods: "an overland off-road build: lifted suspension, all-terrain tyres on black beadlock-style wheels, steel bumpers, rock sliders, a roof rack with a light bar and a snorkel where it fits the car",
    scene: "on a dirt mountain trail with pine trees and dramatic clouds",
  },
  retro: {
    mods: "a retro restomod look: period-correct pinstripes, chrome bumpers and trim, classic multi-spoke wheels with raised white letter tyres and warm vintage paint",
    scene: "on a sunlit coastal road at golden hour, styled like a 1970s magazine shoot but in sharp modern quality",
  },
};

export function buildModPrompt(input: {
  style: ModStyle;
  prompt?: string | null;
  carLabel: string;
  color?: string | null;
  withPhoto: boolean;
}): string {
  const extra = input.prompt?.trim();
  const preset = input.style === "custom" ? null : PRESETS[input.style];
  const mods = preset ? preset.mods : `these modifications: ${extra}`;
  const wish = preset && extra ? ` Additional wishes: ${extra}.` : "";
  const quality =
    "Photorealistic, accurate proportions and design details of the real model, sharp focus, natural reflections, high detail. No text, no watermarks, no people, no readable licence plates.";
  if (input.withPhoto) {
    const paint = input.color ? ` The paint colour is ${input.color}.` : "";
    return `Modify this exact car (${input.carLabel}) in the photo. Keep the same car, camera angle, framing, background and lighting; only change the car itself. Apply ${mods}.${paint}${wish} ${quality}`;
  }
  const car = input.color ? `${input.color} ${input.carLabel}` : input.carLabel;
  const scene = preset ? preset.scene : STREET;
  return `A professional automotive photograph of a ${car} with ${mods}.${wish} Three-quarter front view with the whole car in frame, ${scene}. ${quality}`;
}

export function geminiGenerator(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): ImageGenerator {
  return async ({ prompt, photo }) => {
    const parts: unknown[] = [{ text: prompt }];
    if (photo) parts.push({ inlineData: { mimeType: photo.mimeType, data: photo.data } });
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Gemini returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    };
    const image = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!image?.data) throw new Error("Gemini returned no image");
    return { mimeType: image.mimeType ?? "image/png", data: Buffer.from(image.data, "base64") };
  };
}
