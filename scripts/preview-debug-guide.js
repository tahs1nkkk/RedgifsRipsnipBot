const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "edge-extension");
const port = 4177;

http.createServer((request, response) => {
  const requestPath = request.url === "/" ? "debug-guide.html" : request.url.slice(1).split("?")[0];
  const file = path.resolve(root, requestPath);
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  const extension = path.extname(file);
  response.setHeader("content-type", extension === ".css" ? "text/css" : extension === ".js" ? "text/javascript" : "text/html; charset=utf-8");
  fs.createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Debug guide preview: http://127.0.0.1:${port}`);
});
