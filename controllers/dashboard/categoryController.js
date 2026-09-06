const formidable = require("formidable");
const { responseReturn } = require("../../utiles/response");
const categoryModel = require("../../models/categoryModel");
const {
  createMediaKey,
  deleteMedia,
  uploadMedia,
} = require("../../services/mediaStorage");
const { deleteMediaIfUnreferenced } = require("../../services/mediaReferences");

class categoryController {
  add_category = async (req, res) => {
    const form = formidable();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        responseReturn(res, 404, { error: "something went wrong" });
      } else {
        let { name } = fields;
        const rawImage = files?.image;
        const image = Array.isArray(rawImage) ? rawImage[0] : rawImage;
        name = name.trim();
        const slug = name.split(" ").join("-");

        try {
          if (!image?.filepath) {
            return responseReturn(res, 400, { error: "Image file is required" });
          }

          const result = await uploadMedia(
            image,
            "categorys",
            createMediaKey("categorys", "new", image),
          );

          if (result) {
            let category;
            try {
              category = await categoryModel.create({
                name,
                slug,
                image: result.url,
              });
            } catch (databaseError) {
              await deleteMedia(result.url);
              throw databaseError;
            }
            responseReturn(res, 201, {
              category,
              message: "Category Added Successfully",
            });
          } else {
            responseReturn(res, 404, { error: "Image Upload File" });
          }
        } catch (error) {
          responseReturn(res, 500, { error: "Internal Server Error" });
        }
      }
    });
  };

  // end method

  get_category = async (req, res) => {
    const { page, searchValue, parPage } = req.query;

    try {
      let skipPage = "";
      if (parPage && page) {
        skipPage = parseInt(parPage) * (parseInt(page) - 1);
      }

      if (searchValue && page && parPage) {
        const categorys = await categoryModel
          .find({
            $text: { $search: searchValue },
          })
          .skip(skipPage)
          .limit(parPage)
          .sort({ createdAt: -1 });
        const totalCategory = await categoryModel
          .find({
            $text: { $search: searchValue },
          })
          .countDocuments();
        responseReturn(res, 200, { categorys, totalCategory });
      } else if (searchValue === "" && page && parPage) {
        const categorys = await categoryModel
          .find({})
          .skip(skipPage)
          .limit(parPage)
          .sort({ createdAt: -1 });
        const totalCategory = await categoryModel.find({}).countDocuments();
        responseReturn(res, 200, { categorys, totalCategory });
      } else {
        const categorys = await categoryModel.find({}).sort({ createdAt: -1 });
        const totalCategory = await categoryModel.find({}).countDocuments();
        responseReturn(res, 200, { categorys, totalCategory });
      }
    } catch (error) {
      console.log(error.message);
    }
  };

  // end method

  update_category = async (req, res) => {
    const form = formidable();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        responseReturn(res, 404, { error: "something went wrong" });
      } else {
        let { name } = fields;
        const rawImage = files?.image;
        const image = Array.isArray(rawImage) ? rawImage[0] : rawImage;
        const { id } = req.params;

        name = name.trim();
        const slug = name.split(" ").join("-");

        try {
          const existingCategory = await categoryModel.findById(id);
          if (!existingCategory) {
            return responseReturn(res, 404, { error: "Category not found" });
          }

          let result = null;
          if (image) {
            result = await uploadMedia(
              image,
              "categorys",
              createMediaKey("categorys", id, image),
            );
          }

          const updateData = {
            name,
            slug,
          };

          if (result) {
            updateData.image = result.url;
          }

          let category;
          try {
            category = await categoryModel.findByIdAndUpdate(id, updateData, {
              new: true,
            });
          } catch (databaseError) {
            if (result) await deleteMedia(result.url);
            throw databaseError;
          }
          if (result && existingCategory.image !== result.url) {
            try {
              await deleteMediaIfUnreferenced(existingCategory.image);
            } catch (cleanupError) {
              console.error("Unable to clean up the previous category image:", cleanupError.message);
            }
          }
          responseReturn(res, 200, {
            category,
            message: "Category Updated successfully",
          });
        } catch (error) {
          responseReturn(res, 500, { error: "Internal Server Error" });
        }
      }
    });
  };

  // end method

  deleteCategory = async (req, res) => {
    const categoryId = req.params.id;
    try {
      const existingCategory = await categoryModel.findById(categoryId);
      if (!existingCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      const deleteCategory = await categoryModel.findByIdAndDelete(categoryId);

      if (!deleteCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      try {
        await deleteMediaIfUnreferenced(existingCategory.image);
      } catch (cleanupError) {
        console.error("Unable to clean up the deleted category image:", cleanupError.message);
      }
      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      console.log(`Error delete category with id ${categoryId}:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
  // end method
}

module.exports = new categoryController();
