import Header from "@/components/Header";
import EmailManager from "@/components/EmailManager";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Email Auto Manager
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Streamline your email workflow with intelligent automation and seamless Outlook integration
            </p>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <EmailManager />
          </div>
        </div>
      </main>
    </div>
  );
}
