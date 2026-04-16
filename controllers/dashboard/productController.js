const formidable = require("formidable");
const { responseReturn } = require("../../utiles/response");
const cloudinary = require("cloudinary").v2;
const productModel = require("../../models/productModel");
const sellerModel = require("../../models/sellerModel");

class productController {
  add_product = async (req, res) => {
    const { id } = req;
    const form = formidable({ multiples: true });

    form.parse(req, async (err, field, files) => {
      let { name, category, description, stock, price, discount, brand } = field;

      let { images } = files;
      name = name.trim();
      const slug = name.split(" ").join("-");

      cloudinary.config({
        cloud_name: process.env.cloud_name,
        api_key: process.env.api_key,
        api_secret: process.env.api_secret,
        secure: true,
      });

      try {
        const seller = await sellerModel.findById(id);
        const shopName = seller?.shopInfo?.shopName?.trim();
        if (!shopName) {
          return responseReturn(res, 400, {
            error: "Seller shop name is required before adding products",
          });
        }

        let allImageUrl = [];

        if (!Array.isArray(images)) {
          images = [images];
        }

        for (let i = 0; i < images.length; i++) {
          const result = await cloudinary.uploader.upload(images[i].filepath, {
            folder: "products",
          });

          allImageUrl.push(result.url);
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
    try {
      const product = await productModel.findOne({ _id: productId, sellerId: id });
      if (!product) {
        return responseReturn(res, 404, { error: 'Product not found or unauthorized' });
      }
      await productModel.deleteOne({ _id: productId });
      responseReturn(res, 200, { message: 'Product deleted successfully' });
    } catch (error) {
      responseReturn(res, 500, { error: error.message });
    }
  };

  // End Method

  product_image_update = async (req, res) => {
    const form = formidable({ multiples: true });

    form.parse(req, async (err, field, files) => {
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

      if (err) {
        responseReturn(res, 400, { error: err.message });
      } else {
        try {
          const productData = await productModel.findById(productId);

          if (!productData) {
            return responseReturn(res, 404, { error: "Product Not Found" });
          }

          let { images } = productData;

          if (addImage) {
            if (!newImage || !newImage.filepath) {
              return responseReturn(res, 400, {
                error: "New image file is required",
              });
            }

            cloudinary.config({
              cloud_name: process.env.cloud_name,
              api_key: process.env.api_key,
              api_secret: process.env.api_secret,
              secure: true,
            });

            const result = await cloudinary.uploader.upload(newImage.filepath, {
              folder: "products",
            });

            const uploadedImageUrl = result?.secure_url || result?.url;

            if (uploadedImageUrl) {
              images.push(uploadedImageUrl);
              await productModel.findByIdAndUpdate(productId, { images });

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

          cloudinary.config({
            cloud_name: process.env.cloud_name,
            api_key: process.env.api_key,
            api_secret: process.env.api_secret,
            secure: true,
          });

          const result = await cloudinary.uploader.upload(newImage.filepath, {
            folder: "products",
          });

          const uploadedImageUrl = result?.secure_url || result?.url;

          if (uploadedImageUrl) {
            images[index] = uploadedImageUrl;
            await productModel.findByIdAndUpdate(productId, { images });

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
      }
    });
  };
  // End Method
}

module.exports = new productController();
