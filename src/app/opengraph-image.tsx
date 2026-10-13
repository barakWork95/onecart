import { renderShareCard, SHARE_CARD_ALT, SHARE_CARD_SIZE } from "@/app/_share-card";

export const alt = SHARE_CARD_ALT;
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderShareCard();
}
