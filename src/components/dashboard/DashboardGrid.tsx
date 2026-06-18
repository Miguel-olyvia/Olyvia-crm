import { ReactNode } from "react";

interface DashboardGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}

const DashboardGrid = ({ children, columns = 3 }: DashboardGridProps) => {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-2 lg:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={`grid gap-6 ${gridCols[columns]}`}>
      {children}
    </div>
  );
};

export default DashboardGrid;
