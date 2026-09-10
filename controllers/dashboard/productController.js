const formidable = require("formidable");
const { responseReturn } = require("../../utiles/response");
const productModel = require("../../models/productModel");
const sellerModel = require("../../models/sellerModel");
const reviewModel = require("../../models/reviewModel");
const cardModel = require("../../models/cardModel");
const wishlistModel = require("../../models/wishlistModel");
const bannerModel = require("../../models/bannerModel");
const {
  createMediaKey,
  deleteMedia,
  uploadMedia,
} = require("../../services/mediaStorage");
const {
  deleteMediaIfUnreferenced,
  deleteMediaAndPreserveOrderHistory,
} = require("../../services/mediaReferences");

class productController {
  add_product = async (req, res) => {
    const { id } = req;
    const form = formidable({ multiples: true });

    form.parse(req, async (err, field, files) => {
      if (err) {
        return responseReturn(res, 400, { error: err.message });
      }

      let { name, category, description, stock, price, discount, brand } = field;

      let { images } = files || {};
      name = name.trim();
      const slug = name.split(" ").join("-");
      const uploadedUrls = [];

      try {
        const seller = await sellerModel.findById(id);
        const shopName = seller?.shopInfo?.shopName?.trim();
        if (!shopName) {
          return responseReturn(res, 400, {
            error: "Seller shop name is required before adding products",
          });
        }

        let allImageUrl = [];

        if (!images) {
          return responseReturn(res, 400, { error: "At least one product image is required" });
        }
        if (!Array.isArray(images)) {
          images = [images];
        }

        for (let i = 0; i < images.length; i++) {
          const result = await uploadMedia(
            images[i],
            "products",
            createMediaKey("products", id, images[i]),
          );

          allImageUrl.push(result.url);
          uploadedUrls.push(result.url);
        }

        await productModel.create({
          sellerId: id,
          name,
          slug,
          shopName,
          category: category.trim(),
          description: description.trim(),
          stock: parseInt(stock),
          price: parseInt(price),
          discount: parseInt(discount),
          images: allImageUrl,
          brand: brand.trim(),
        });
        responseReturn(res, 201, { message: "Product Added Successfully" });
      } catch (error) {
        for (const url of uploadedUrls) {
          try {
            await deleteMedia(url);
          } catch (cleanupError) {
            console.error("Unable to clean up an incomplete product upload:", cleanupError.message);
          }
        }
        responseReturn(res, 500, { error: error.message });
      }
    });
  };

  /// end method

  products_get = async (req, res) => {
    const { page, searchValue, parPage } = req.query;
    const { id } = req;

    const skipPage = parseInt(parPage) * (parseInt(page) - 1);

    try {
      if (searchValue) {
        const products = await productModel
          .find({
            $text: { $search: searchValue },
            sellerId: id,
          })
          .skip(skipPage)
          .limit(parPage)
          .sort({ createdAt: -1 });
        const totalProduct = await productModel
          .find({
            $text: { $search: searchValue },
            sellerId: id,
          })
          .countDocuments();
        responseReturn(res, 200, { products, totalProduct });
      } else {
        const products = await productModel
          .find({ sellerId: id })
          .skip(skipPage)
          .limit(parPage)
          .sort({ createdAt: -1 });
        const totalProduct = await productModel
          .find({ sellerId: id })
          .countDocuments();
        responseReturn(res, 200, { products, totalProduct });
      }
    } catch (error) {
      console.log(error.message);
    }
  };

  // End Method

  product_get = async (req, res) => {
    const { productId } = req.params;
    const { id } = req;
    try {
      const product = await productModel.findById(productId);
      if (
        product &&
        id &&
        String(product.sellerId) === String(id)
      ) {
        const seller = await sellerModel.findById(id);
        const currentShopName = seller?.shopInfo?.shopName?.trim();

        if (currentShopName && currentShopName !== product.shopName) {
          await productModel.findByIdAndUpdate(productId, {
            shopName: currentShopName,
          });
          product.shopName = currentShopName;
        }
      }
      responseReturn(res, 200, { product });
    } catch (error) {
      console.log(error.message);
    }
  };
  // End Method

  product_update = async (req, res) => {
    let {
      name,
      description,
      stock,
      price,
      category,
      discount,
      brand,
      productId,
    } = req.body;
    name = name.trim();
    const slug = name.split(" ").join("-");

    try {
      await productModel.findByIdAndUpdate(productId, {
        name,
        description,
        stock,
        price,
        category,
        discount,
        brand,
        productId,
        slug,
      });
      const product = await productModel.findById(productId);
      responseReturn(res, 200, {
        product,
        message: "Product Updated Successfully",
      });
    } catch (error) {
      responseReturn(res, 500, { error: error.message });
    }
  };

  // End Method

  delete_product = async (req, res) => {
    const { productId } = req.params;
    const { id } = req; // seller id from auth middleware
    let product;

    try {
      product = await productModel.findOne({ _id: productId, sellerId: id });
      if (!product) {
        return responseReturn(res, 404, { error: 'Product not found or unauthorized' });
      }
    } catch (error) {
      console.error(`Failed to look up product ${productId} before deletion:`, error.message);
      return responseReturn(res, 500, { error: error.message });
    }

    // Gather banner images tied to this product so they can be cleaned up alongside the product images.
    let banners = [];
    try {
      banners = (await bannerModel.find({ productId })) || [];
    } catch (error) {
      console.error(`Failed to look up banners for product ${productId}:`, error.message);
    }

    try {
      await productModel.deleteOne({ _id: productId });
    } catch (error) {
      console.error(`Failed to delete product ${productId} from the database:`, error.message);
      return responseReturn(res, 500, { error: error.message });
    }

    // Remove dependent records so nothing references the deleted product.
    const cascadeDeletes = [
      ["reviews", () => reviewModel.deleteMany({ productId })],
      ["cart items", () => cardModel.deleteMany({ productId })],
      ["wishlist entries", () => wishlistModel.deleteMany({ productId })],
      ["banners", () => bannerModel.deleteMany({ productId })],
    ];
    for (const [label, run] of cascadeDeletes) {
      try {
        await run();
      } catch (error) {
        console.error(`Failed to delete ${label} for product ${productId}:`, error.message);
      }
    }

    // Permanently delete every product/banner image from Cloudflare R2. Any historical order that
    // snapshotted one of these images has its copy swapped for a placeholder first, so order history
    // keeps rendering instead of showing a broken image.
    const mediaUrls = [
      ...(product.images || []),
      ...banners.map((banner) => banner.banner).filter(Boolean),
    ];
    for (const url of mediaUrls) {
      try {
        await deleteMediaAndPreserveOrderHistory(url);
      } catch (cleanupError) {
        console.error(`Failed to delete media "${url}" for product ${productId} from Cloudflare R2:`, cleanupError.message);
      }
    }

    responseReturn(res, 200, { message: 'Product deleted successfully' });
  };

  // End Method

  product_image_update = async (req, res) => {
    const form = formidable({ multiples: true });

    form.parse(req, async (err, field, files) => {
      if (err) {
        return responseReturn(res, 400, { error: err.message });
      }

      const normalizeFieldValue = (value) =>
        Array.isArray(value) ? value[0] : value;

      const parseBooleanField = (value) => {
        const normalized = normalizeFieldValue(value);
        if (typeof normalized === "boolean") return normalized;
        if (typeof normalized === "number") return normalized === 1;
        if (typeof normalized === "string") {
          const lower = normalized.trim().toLowerCase();
          return lower === "true" || lower === "1" || lower === "yes";
        }
        return false;
      };

      const oldImage = normalizeFieldValue(field.oldImage);
      const productId = normalizeFieldValue(field.productId);
      const imageIndex = normalizeFieldValue(field.imageIndex);
      const removeImage = parseBooleanField(field.removeImage);
      const addImage = parseBooleanField(field.addImage);

      const rawNewImage = files?.newImage;
      const newImage = Array.isArray(rawNewImage) ? rawNewImage[0] : rawNewImage;

      try {
          const productData = await productModel.findOne({
            _id: productId,
            sellerId: req.id,
          });

          if (!productData) {
            return responseReturn(res, 404, { error: "Product Not Found" });
          }

          let images = [...(productData.images || [])];

          if (addImage) {
            if (!newImage || !newImage.filepath) {
              return responseReturn(res, 400, {
                error: "New image file is required",
              });
            }

            const result = await uploadMedia(
              newImage,
              "products",
              createMediaKey("products", productId, newImage),
            );

            const uploadedImageUrl = result?.url;

            if (uploadedImageUrl) {
              images.push(uploadedImageUrl);
              try {
                await productModel.findByIdAndUpdate(productId, { images });
              } catch (databaseError) {
                await deleteMedia(uploadedImageUrl);
                throw databaseError;
              }

              const product = await productModel.findById(productId);
              return responseReturn(res, 200, {
                product,
                message: "Product Image Added Successfully",
              });
            }

            return responseReturn(res, 404, { error: "Image Upload Failed" });
          }

          let index = -1;
          if (imageIndex !== undefined && imageIndex !== null && imageIndex !== "") {
            const parsedIndex = Number(imageIndex);
            if (!Number.isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < images.length) {
              index = parsedIndex;
            }
          }

          if (index < 0) {
            index = images.findIndex((img) => img === oldImage);
          }

          if (index < 0) {
            return responseReturn(res, 404, { error: "Image Not Found" });
          }

          if (removeImage) {
            if (images.length <= 1) {
              return responseReturn(res, 400, {
                error: "At least one product image is required",
              });
            }

            images = images.filter((_, imageIndex) => imageIndex !== index);
            await productModel.findByIdAndUpdate(productId, { images });
            try {
              await deleteMediaIfUnreferenced(productData.images[index]);
            } catch (cleanupError) {
              console.error("Unable to clean up the removed product image:", cleanupError.message);
            }

            const product = await productModel.findById(productId);
            return responseReturn(res, 200, {
              product,
              message: "Product Image Removed Successfully",
            });
          }

          if (!newImage) {
            return responseReturn(res, 400, {
              error: "New image file is required",
            });
          }

          if (!newImage.filepath) {
            return responseReturn(res, 400, {
              error: "Invalid image file",
            });
          }

          const result = await uploadMedia(
            newImage,
            "products",
            createMediaKey("products", productId, newImage),
          );

          const uploadedImageUrl = result?.url;

          if (uploadedImageUrl) {
            const previousImageUrl = images[index];
            images[index] = uploadedImageUrl;
            try {
              await productModel.findByIdAndUpdate(productId, { images });
            } catch (databaseError) {
              await deleteMedia(uploadedImageUrl);
              throw databaseError;
            }
            try {
              await deleteMediaIfUnreferenced(previousImageUrl);
            } catch (cleanupError) {
              console.error("Unable to clean up the replaced product image:", cleanupError.message);
            }

            const product = await productModel.findById(productId);
            return responseReturn(res, 200, {
              product,
              message: "Product Image Updated Successfully",
            });
          } else {
            return responseReturn(res, 404, { error: "Image Upload Failed" });
          }
      } catch (error) {
        return responseReturn(res, 404, { error: error.message });
      }
    });
  };
  // End Method
}

module.exports = new productController();
