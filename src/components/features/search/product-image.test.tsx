import { fireEvent, render } from "@testing-library/react";
import { ProductImage } from "@/components/features/search/product-image";

describe("ProductImage", () => {
  it("shows the store's photo straight from its CDN", () => {
    const { container } = render(
      <ProductImage src="https://i.ebayimg.com/images/g/a/s-l500.jpg" sizes="50vw" className="p-4" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://i.ebayimg.com/images/g/a/s-l500.jpg");
    expect(img).toHaveClass("object-contain", "p-4");
  });

  it("swaps a photo that fails to load, or a missing one, for a placeholder", () => {
    const { container } = render(<ProductImage src="https://i.ebayimg.com/broken.jpg" sizes="50vw" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();

    const empty = render(<ProductImage src={null} sizes="50vw" />);
    expect(empty.container.querySelector("img")).toBeNull();
  });
});
