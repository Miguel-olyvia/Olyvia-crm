import Layout from "@/components/Layout";
import { useCompany } from "@/contexts/CompanyContext";
import SystemAdminDashboard from "@/components/dashboard/SystemAdminDashboard";
import CompanyAdminDashboard from "@/components/dashboard/CompanyAdminDashboard";
import WorkerDashboard from "@/components/dashboard/WorkerDashboard";
import WelcomeDashboard from "@/components/dashboard/WelcomeDashboard";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

const dashboardRoleMap: Record<string, string> = {
  super_admin: "company_admin",
  org_admin: "company_admin",
  org_editor: "worker_user",
  org_viewer: "worker_user",
};

const Dashboard = () => {
  const { userType, companies, isLoading } = useCompany();

  const renderDashboard = () => {
    if (isLoading) {
      return <div className="min-h-[50vh] flex items-center justify-center"><OlyviaLoader size={40} /></div>;
    }

    if (userType === "system_admin") {
      return <SystemAdminDashboard />;
    }

    if (!companies || companies.length === 0) {
      return <WelcomeDashboard />;
    }

    const effectiveUserType = dashboardRoleMap[userType] || userType;

    switch (effectiveUserType) {
      case "system_admin":
        return <SystemAdminDashboard />;
      case "company_admin":
        return <CompanyAdminDashboard />;
      default:
        return <WorkerDashboard />;
    }
  };

  return <>{renderDashboard()}</>;
};

export default Dashboard;
