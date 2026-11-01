module.exports = {
  createCanvas() {
    throw new Error("Canvas rendering is not available in this environment.");
  },
  loadImage() {
    throw new Error("Canvas rendering is not available in this environment.");
  },
  Image: class {},
  Canvas: class {},
};
