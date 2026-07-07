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
        <p className="mt-1 text-sm text-slate-500">
          Your AI copilot for running a smarter business
        </p>
      </div>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
