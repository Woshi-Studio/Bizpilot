export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-indigo-600">
          Jephelen
        </h1>
        <p className="page-sub">
          Your AI copilot for running a smarter business
        </p>
      </div>
      <div className="w-full max-w-md card p-8">
        {children}
      </div>
    </div>
  );
}
