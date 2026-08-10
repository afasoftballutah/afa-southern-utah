export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/director", "/scorekeeper", "/register/sign"],
    },
  };
}
