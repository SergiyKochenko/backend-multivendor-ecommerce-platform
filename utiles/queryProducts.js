class queryProducts {
  products = [];
  query = {};
  constructor(products, query) {
    this.products = products;
    this.query = query;
  }

  categoryQuery = () => {
    this.products = this.query.category
      ? this.products.filter((c) => c.category === this.query.category)
      : this.products;
    return this;
  };

  ratingQuery = () => {
    this.products = this.query.rating
      ? this.products.filter(
          (c) =>
            parseInt(this.query.rating) <= c.rating &&
            c.rating < parseInt(this.query.rating) + 1,
        )
      : this.products;
    return this;
  };

  searchQuery = () => {
    this.products = this.query.searchValue
      ? this.products.filter(
          (p) =>
            p.name.toUpperCase().indexOf(this.query.searchValue.toUpperCase()) >
            -1,
        )
      : this.products;
    return this;
  };

  priceQuery = () => {
    const { lowPrice, highPrice } = this.query;
    if (lowPrice === undefined && highPrice === undefined) return this;

    const minPrice = lowPrice !== undefined ? Number(lowPrice) : 0;
    const maxPrice =
      highPrice !== undefined ? Number(highPrice) : Number.MAX_SAFE_INTEGER;

    this.products = this.products.filter(
      (p) => p.price >= minPrice && p.price <= maxPrice,
    );
    return this;
  };
  sortByPrice = () => {
    if (this.query.sortPrice) {
      if (this.query.sortPrice === "low-to-high") {
        this.products = this.products.sort(function (a, b) {
          return a.price - b.price;
        });
      } else {
        this.products = this.products.sort(function (a, b) {
          return b.price - a.price;
        });
      }
    }
    return this;
  };

  skip = () => {
    const pageNumber = parseInt(this.query.pageNumber || 1);
    const parPage = parseInt(this.query.parPage) || 12;
    const skipPage = (pageNumber - 1) * parPage;
    this.products = this.products.slice(skipPage);
    return this;
  };

  limit = () => {
    const parPage = parseInt(this.query.parPage) || 12;
    this.products = this.products.slice(0, parPage);
    return this;
  };

  getProducts = () => {
    return this.products;
  };

  countProducts = () => {
    return this.products.length;
  };
}

module.exports = queryProducts;
