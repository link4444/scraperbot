# API Contract Specifications

All API communication between the React frontend and the FastAPI backend must conform to these contract specifications.

---

## 1. Track Product
Adds a new product URL to be tracked and immediately crawls it.

*   **Endpoint**: `POST /api/products`
*   **Request Headers**: `Content-Type: application/json`
*   **Request Body**:
    ```json
    {
      "url": "string (URL, required)",
      "target_price": "float (positive, required)"
    }
    ```
*   **Responses**:
    *   `201 Created`:
        ```json
        {
          "id": 1,
          "url": "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
          "title": "A Light in the Attic",
          "image_url": "http://books.toscrape.com/media/cache/2c/da/2cdad77c477b32af450d9256d5e1ccb2.jpg",
          "current_price": 51.77,
          "target_price": 50.00,
          "alert_triggered": false,
          "status": "Active",
          "created_at": "2026-06-09T13:17:00Z"
        }
        ```
    *   `400 Bad Request`: Invalid URL format or negative target price.
    *   `422 Unprocessable Entity`: Validation failures.

---

## 2. List Products
Returns all tracked products.

*   **Endpoint**: `GET /api/products`
*   **Responses**:
    *   `200 OK`:
        ```json
        [
          {
            "id": 1,
            "url": "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
            "title": "A Light in the Attic",
            "image_url": "http://books.toscrape.com/media/cache/2c/da/2cdad77c477b32af450d9256d5e1ccb2.jpg",
            "current_price": 51.77,
            "target_price": 50.00,
            "alert_triggered": false,
            "status": "Active",
            "created_at": "2026-06-09T13:17:00Z"
          }
        ]
        ```

---

## 3. Update Product Threshold
Modifies the target price alert threshold.

*   **Endpoint**: `PATCH /api/products/{id}`
*   **Request Body**:
    ```json
    {
      "target_price": "float (positive, required)"
    }
    ```
*   **Responses**:
    *   `200 OK`: Returns the updated product object.
    *   `404 Not Found`: Product ID does not exist.

---

## 4. Delete Product
Removes a product from tracking and deletes its historical entries.

*   **Endpoint**: `DELETE /api/products/{id}`
*   **Responses**:
    *   `204 No Content`: Successfully deleted.
    *   `404 Not Found`: Product ID does not exist.

---

## 5. Get Product Price History
Fetches historical data points for Recharts.

*   **Endpoint**: `GET /api/products/{id}/history`
*   **Responses**:
    *   `200 OK`:
        ```json
        [
          {
            "id": 101,
            "product_id": 1,
            "price": 51.77,
            "scraped_at": "2026-06-09T13:17:00Z"
          },
          {
            "id": 105,
            "product_id": 1,
            "price": 49.50,
            "scraped_at": "2026-06-09T14:17:00Z"
          }
        ]
        ```
    *   `404 Not Found`: Product ID does not exist.

---

## 6. Toggle Demo Mode
Reschedules the background monitoring intervals dynamically.

*   **Endpoint**: `POST /api/demo/toggle`
*   **Query Parameters**: `demo=true|false`
*   **Responses**:
    *   `200 OK`:
        ```json
        {
          "status": "success",
          "demo_mode": true,
          "interval": "10s"
        }
        ```
