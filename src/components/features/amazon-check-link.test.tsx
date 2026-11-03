import { render, screen } from "@testing-library/react";
import { AmazonCheckLink } from "@/components/features/amazon-check-link";

it("labels the separate Amazon destination and discloses commission without a price", () => {
  render(<AmazonCheckLink query="sony wh-1000xm5" tag="onecart-test-20" locale="he" />);
  const link = screen.getByRole("link", { name: "בדוק מחיר ב-Amazon" });
  expect(link).toHaveAttribute("href", "https://www.amazon.com/s?k=sony+wh-1000xm5&tag=onecart-test-20");
  expect(link).toHaveAttribute("rel", "sponsored nofollow noopener");
  expect(screen.getByText("מחירי Amazon אינם כלולים בהשוואה הזו.")).toBeInTheDocument();
  expect(screen.getByText(/ייתכן שנקבל עמלה/)).toBeInTheDocument();
  expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
});
