export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/scorekeeper", "/register/sign"],
    },
  };
}
