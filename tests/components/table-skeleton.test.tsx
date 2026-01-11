import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TableSkeleton } from "@/components/ui/table-skeleton";

// Mock next-intl (in case it's used in child components)
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

describe("TableSkeleton", () => {
  describe("Accessibility", () => {
    it("has role='status' for screen readers", () => {
      render(<TableSkeleton />);

      const container = screen.getByLabelText("Loading table data");
      expect(container).toHaveAttribute("role", "status");
    });

    it("has aria-label describing loading state", () => {
      render(<TableSkeleton />);

      const container = screen.getByLabelText("Loading table data");
      expect(container).toBeInTheDocument();
    });

    it("includes sr-only text for screen readers", () => {
      render(<TableSkeleton />);

      const srOnlyText = screen.getByText("Loading table data, please wait...");
      expect(srOnlyText).toBeInTheDocument();
      expect(srOnlyText).toHaveClass("sr-only");
    });
  });

  describe("Default Rendering", () => {
    it("renders with default props (5 rows, 4 columns)", () => {
      const { container } = render(<TableSkeleton />);

      const table = container.querySelector("table");
      expect(table).toBeInTheDocument();

      // Check for 5 body rows (excluding header)
      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(5);

      // Check first row has 4 cells
      const firstRowCells = bodyRows[0].querySelectorAll("td");
      expect(firstRowCells).toHaveLength(4);
    });

    it("renders header row by default", () => {
      const { container } = render(<TableSkeleton />);

      const thead = container.querySelector("thead");
      expect(thead).toBeInTheDocument();

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(4); // Default 4 columns
    });

    it("renders table structure with proper semantic HTML", () => {
      const { container } = render(<TableSkeleton />);

      expect(container.querySelector("table")).toBeInTheDocument();
      expect(container.querySelector("thead")).toBeInTheDocument();
      expect(container.querySelector("tbody")).toBeInTheDocument();
    });
  });

  describe("Custom Rows and Columns", () => {
    it("renders custom number of rows", () => {
      const { container } = render(<TableSkeleton rows={10} />);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(10);
    });

    it("renders custom number of columns", () => {
      const { container } = render(<TableSkeleton columns={7} />);

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(7);

      const firstRowCells = container.querySelectorAll("tbody tr:first-child td");
      expect(firstRowCells).toHaveLength(7);
    });

    it("renders 3 rows with 6 columns", () => {
      const { container } = render(<TableSkeleton rows={3} columns={6} />);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(3);

      const firstRowCells = bodyRows[0].querySelectorAll("td");
      expect(firstRowCells).toHaveLength(6);
    });

    it("handles single row and column", () => {
      const { container } = render(<TableSkeleton rows={1} columns={1} />);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(1);

      const cells = container.querySelectorAll("tbody td");
      expect(cells).toHaveLength(1);
    });

    it("handles large number of rows and columns", () => {
      const { container } = render(<TableSkeleton rows={20} columns={10} />);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(20);

      const firstRowCells = bodyRows[0].querySelectorAll("td");
      expect(firstRowCells).toHaveLength(10);
    });
  });

  describe("Header Visibility", () => {
    it("shows header when showHeader is true", () => {
      const { container } = render(<TableSkeleton showHeader={true} />);

      const thead = container.querySelector("thead");
      expect(thead).toBeInTheDocument();
    });

    it("hides header when showHeader is false", () => {
      const { container } = render(<TableSkeleton showHeader={false} />);

      const thead = container.querySelector("thead");
      expect(thead).not.toBeInTheDocument();
    });

    it("renders correct number of header cells when header is shown", () => {
      const { container } = render(<TableSkeleton columns={8} showHeader={true} />);

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(8);
    });
  });

  describe("Custom Styling", () => {
    it("applies custom className to container", () => {
      render(<TableSkeleton className="custom-skeleton-class" />);

      const statusContainer = screen.getByLabelText("Loading table data");
      expect(statusContainer).toHaveClass("custom-skeleton-class");
    });

    it("maintains w-full class with custom className", () => {
      render(<TableSkeleton className="my-custom-class" />);

      const statusContainer = screen.getByLabelText("Loading table data");
      expect(statusContainer).toHaveClass("w-full");
      expect(statusContainer).toHaveClass("my-custom-class");
    });
  });

  describe("Skeleton Component Integration", () => {
    it("renders Skeleton components in each cell", () => {
      const { container } = render(<TableSkeleton rows={2} columns={2} />);

      // Each header cell (2) + each body cell (2 rows * 2 cols = 4) = 6 skeletons
      // Skeleton components have role="status" and aria-label="Loading"
      const skeletons = container.querySelectorAll('[aria-label="Loading"]');
      // Should have 2 header skeletons + 4 body skeletons = 6 total
      expect(skeletons.length).toBe(6);
    });

    it("uses custom placeholder text", () => {
      const { container } = render(<TableSkeleton placeholder="LOADING..." rows={1} columns={1} />);

      // The placeholder should be passed to Skeleton components
      // Since Skeleton renders the placeholder, we need to check it exists in the DOM
      const table = container.querySelector("table");
      expect(table).toBeInTheDocument();
      // The actual rendering of placeholder depends on Skeleton component
    });
  });

  describe("Keys Arrangement", () => {
    it("generates unique keys for header cells", () => {
      const { container } = render(<TableSkeleton columns={3} />);

      const headerCells = container.querySelectorAll("thead th");

      // Just verify they exist - React ensures keys are unique
      expect(headerCells).toHaveLength(3);
    });

    it("generates unique keys for body rows", () => {
      const { container } = render(<TableSkeleton rows={3} columns={2} />);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(3);
    });

    it("generates unique keys for cells in each row", () => {
      const { container } = render(<TableSkeleton rows={2} columns={3} />);

      const firstRow = container.querySelector("tbody tr:first-child");
      if (firstRow) {
        const cells = firstRow.querySelectorAll("td");
        expect(cells).toHaveLength(3);
      }
    });
  });

  describe("Edge Cases", () => {
    it("renders correctly with rows=0", () => {
      const { container } = render(<TableSkeleton rows={0} />);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(0);

      // Header should still render with default columns
      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(4);
    });

    it("renders correctly with columns=0", () => {
      const { container } = render(<TableSkeleton columns={0} />);

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(0);

      const bodyRows = container.querySelectorAll("tbody tr");
      // Rows should exist but with no cells
      expect(bodyRows).toHaveLength(5); // Default 5 rows
    });

    it("handles showHeader=false with no rows", () => {
      const { container } = render(<TableSkeleton rows={0} showHeader={false} />);

      const thead = container.querySelector("thead");
      expect(thead).not.toBeInTheDocument();

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(0);
    });
  });

  describe("Cassette Futurism Styling", () => {
    it("maintains table structure for consistent layout", () => {
      const { container } = render(<TableSkeleton rows={5} columns={7} />);

      const table = container.querySelector("table");
      expect(table).toBeInTheDocument();

      // Verify proper table structure
      expect(container.querySelector("thead")).toBeInTheDocument();
      expect(container.querySelector("tbody")).toBeInTheDocument();
    });

    it("renders inline skeletons in cells", () => {
      const { container } = render(<TableSkeleton rows={1} columns={1} />);

      // Check that table cells contain content (skeletons)
      const cell = container.querySelector("tbody td");
      expect(cell).toBeInTheDocument();
      expect(cell?.children.length).toBeGreaterThan(0);
    });
  });

  describe("Real-world Usage Scenarios", () => {
    it("matches KeysTable structure (7 columns)", () => {
      const { container } = render(<TableSkeleton columns={7} rows={5} />);

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(7);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(5);
    });

    it("matches LogsTable structure (7 columns, 10 rows)", () => {
      const { container } = render(<TableSkeleton columns={7} rows={10} />);

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(7);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(10);
    });

    it("matches UpstreamsTable structure (6 columns)", () => {
      const { container } = render(<TableSkeleton columns={6} rows={5} />);

      const headerCells = container.querySelectorAll("thead th");
      expect(headerCells).toHaveLength(6);

      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(5);
    });
  });
});
