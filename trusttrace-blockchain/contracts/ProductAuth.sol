// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * TrustTrace - Product Authentication
 *
 * Gate 1: Blockchain Ledger Verification
 * Gate 2: AI Image Verification (Off-chain)
 * Gate 3: CASPG - Context-Aware Scan Provenance Gate
 */

contract ProductAuth {

    address public owner;

    mapping(address => bool) public authorizedManufacturers;

    // 12000 means 120.00 km/h
    uint256 public maxPlausibleSpeedScaled = 12000;


    enum ScanContext {
        CUSTODY_TRANSFER,
        INSPECTION,
        PUBLIC_VERIFICATION
    }


    struct Product {

        string name;
        string batchNumber;
        string referenceImageCID;

        address manufacturer;
        uint256 registeredAt;

        bool exists;
        uint256 scanCount;
        bool hasSuspiciousScan;
    }


    // Extended product metadata stored on-chain for the TrustTrace web app.
    // The core Product struct and legacy functions are preserved for compatibility.
    struct ProductDetails {
        string brand;
        string category;
        string sku;
        string unitSerial;
        string manufactureDate;
        string expiryDate;
        string metadataCID;
        bytes32 metadataHash;
    }

    mapping(string => ProductDetails) public productDetails;

    // Prevent the same physical-unit serial from being registered twice by one
    // manufacturer in the same batch, even if a different Product ID is used.
    mapping(bytes32 => bool) public registeredUnitSerials;

    struct ScanRecord {

        int256 latitude;
        int256 longitude;

        uint256 scanTimestamp;
        address scanner;

        ScanContext context;

        uint256 impliedSpeedScaled;
        bool suspicious;
    }


    mapping(string => Product) public products;

    mapping(string => ScanRecord[]) private scanHistory;


    event ProductRegistered(
        string productId,
        string name,
        address manufacturer
    );


    event ProductDetailsRegistered(
        string productId,
        string brand,
        string category,
        string sku,
        string unitSerial,
        string metadataCID,
        bytes32 metadataHash
    );

    event ScanAuditRecorded(
        string productId,
        uint256 scanTimestamp,
        bool suspicious,
        uint256 impliedSpeedScaled,
        bytes32 evidenceHash
    );

    event ProductScanned(
        string productId,
        int256 latitude,
        int256 longitude,
        uint256 scanCount,
        bool suspicious
    );


    event SuspiciousActivity(
        string productId,
        string reason
    );


    event ManufacturerAuthorized(
        address manufacturer
    );


    event ManufacturerRevoked(
        address manufacturer
    );


    // ------------------------------------
    // MODIFIERS
    // ------------------------------------

    modifier onlyOwner() {

        require(
            msg.sender == owner,
            "Only owner can perform this action"
        );

        _;
    }


    modifier onlyAuthorizedManufacturer() {

        require(
            authorizedManufacturers[msg.sender],
            "Not an authorized manufacturer"
        );

        _;
    }


    // ------------------------------------
    // CONSTRUCTOR
    // ------------------------------------

    constructor() {

        owner = msg.sender;

        // Deployer is authorized automatically
        authorizedManufacturers[msg.sender] = true;
    }


    // ------------------------------------
    // MANUFACTURER MANAGEMENT
    // ------------------------------------

    function authorizeManufacturer(
        address _manufacturer
    )
        public
        onlyOwner
    {

        require(
            _manufacturer != address(0),
            "Invalid manufacturer address"
        );

        authorizedManufacturers[_manufacturer] = true;

        emit ManufacturerAuthorized(
            _manufacturer
        );
    }


    function revokeManufacturer(
        address _manufacturer
    )
        public
        onlyOwner
    {

        authorizedManufacturers[_manufacturer] = false;

        emit ManufacturerRevoked(
            _manufacturer
        );
    }


    // ------------------------------------
    // PRODUCT REGISTRATION
    // ------------------------------------

    function registerProduct(
        string memory _productId,
        string memory _name,
        string memory _batchNumber,
        string memory _referenceImageCID
    )
        public
        onlyAuthorizedManufacturer
    {
        require(bytes(_productId).length > 0, "Product ID required");
        require(bytes(_name).length > 0, "Product name required");
        require(bytes(_batchNumber).length > 0, "Batch number required");
        require(bytes(_referenceImageCID).length > 0, "Reference image CID required");
        require(!products[_productId].exists, "Product ID already exists");

        products[_productId] = Product({

            name: _name,

            batchNumber: _batchNumber,

            referenceImageCID: _referenceImageCID,

            manufacturer: msg.sender,

            registeredAt: block.timestamp,

            exists: true,

            scanCount: 0,

            hasSuspiciousScan: false
        });


        emit ProductRegistered(
            _productId,
            _name,
            msg.sender
        );
    }


    /**
     * Relayed registration for the web application. The backend owner/relayer
     * may submit only on behalf of a wallet already authorized by the owner.
     * The relayer validates the authenticated manufacturer application before
     * calling this function. The registered manufacturer wallet is recorded.
     */
    function registerProductWithDetails(
        string memory _productId,
        string memory _name,
        string memory _brand,
        string memory _category,
        string memory _sku,
        string memory _batchNumber,
        string memory _unitSerial,
        string memory _manufactureDate,
        string memory _expiryDate,
        string memory _referenceImageCID,
        string memory _metadataCID,
        bytes32 _metadataHash,
        address _manufacturer
    ) external onlyOwner {
        require(_manufacturer != address(0), "Invalid manufacturer address");
        require(authorizedManufacturers[_manufacturer], "Manufacturer not authorized");
        require(bytes(_productId).length > 0, "Product ID required");
        require(bytes(_name).length > 0, "Product name required");
        require(bytes(_brand).length > 0, "Brand required");
        require(bytes(_category).length > 0, "Category required");
        require(bytes(_batchNumber).length > 0, "Batch number required");
        require(bytes(_unitSerial).length > 0, "Unit serial required");
        require(bytes(_referenceImageCID).length > 0, "Reference image CID required");
        require(bytes(_metadataCID).length > 0, "Metadata CID required");
        require(!products[_productId].exists, "Product ID already exists");
        bytes32 unitKey = keccak256(abi.encodePacked(_manufacturer, _batchNumber, _unitSerial));
        require(!registeredUnitSerials[unitKey], "Unit serial already registered for this manufacturer and batch");
        registeredUnitSerials[unitKey] = true;

        products[_productId] = Product({
            name: _name,
            batchNumber: _batchNumber,
            referenceImageCID: _referenceImageCID,
            manufacturer: _manufacturer,
            registeredAt: block.timestamp,
            exists: true,
            scanCount: 0,
            hasSuspiciousScan: false
        });

        productDetails[_productId] = ProductDetails({
            brand: _brand,
            category: _category,
            sku: _sku,
            unitSerial: _unitSerial,
            manufactureDate: _manufactureDate,
            expiryDate: _expiryDate,
            metadataCID: _metadataCID,
            metadataHash: _metadataHash
        });

        emit ProductRegistered(_productId, _name, _manufacturer);
        emit ProductDetailsRegistered(
            _productId, _brand, _category, _sku, _unitSerial, _metadataCID, _metadataHash
        );
    }

    function verifyProductDetails(string memory _productId)
        external
        view
        returns (
            string memory brand,
            string memory category,
            string memory sku,
            string memory unitSerial,
            string memory manufactureDate,
            string memory expiryDate,
            string memory metadataCID,
            bytes32 metadataHash
        )
    {
        ProductDetails memory details = productDetails[_productId];
        return (
            details.brand,
            details.category,
            details.sku,
            details.unitSerial,
            details.manufactureDate,
            details.expiryDate,
            details.metadataCID,
            details.metadataHash
        );
    }

    /**
     * Store a minimal immutable verification audit event. Precise GPS remains
     * off-chain in the protected application database; only status, speed and
     * a hash of the canonical scan record are written on-chain.
     */
    function recordScanAudit(
        string memory _productId,
        bool _suspicious,
        uint256 _impliedSpeedScaled,
        bytes32 _evidenceHash
    ) external onlyOwner {
        require(products[_productId].exists, "Product does not exist");
        Product storage product = products[_productId];
        product.scanCount += 1;
        if (_suspicious) {
            product.hasSuspiciousScan = true;
            emit SuspiciousActivity(_productId, "CASPG suspicious movement detected");
        }
        emit ScanAuditRecorded(
            _productId, block.timestamp, _suspicious, _impliedSpeedScaled, _evidenceHash
        );
    }

    // ------------------------------------
    // PRODUCT SCANNING
    // ------------------------------------

    // Legacy direct-scan function retained for the existing demo/tests. It writes
    // coordinates to public chain storage/events, so it is owner-only. The web
    // application uses backend Haversine calculation and recordScanAudit instead,
    // which anchors a hash/status without publishing customer coordinates.
    function scanProduct(
        string memory _productId,

        int256 _latitude,

        int256 _longitude,

        ScanContext _context
    )
        public
        onlyOwner
        returns (
            bool isAuthentic,
            bool isSuspicious
        )
    {

        // Gate 1: Blockchain ledger verification

        if (!products[_productId].exists) {

            emit SuspiciousActivity(
                _productId,
                "Unregistered or fake product ID"
            );

            return (false, true);
        }


        // GPS coordinate validation

        require(
            _latitude >= -90000000 &&
            _latitude <= 90000000,

            "Invalid latitude"
        );


        require(
            _longitude >= -180000000 &&
            _longitude <= 180000000,

            "Invalid longitude"
        );


        Product storage product =
            products[_productId];

        product.scanCount += 1;


        bool suspicious = false;

        uint256 impliedSpeedScaled = 0;


        // Gate 3: CASPG travel-speed analysis

        if (
            scanHistory[_productId].length > 0
        ) {

            ScanRecord memory lastScan =
                scanHistory[_productId][
                    scanHistory[_productId].length - 1
                ];


            uint256 timeElapsed;


            if (
                block.timestamp > lastScan.scanTimestamp
            ) {

                timeElapsed =
                    block.timestamp - lastScan.scanTimestamp;

            } else {

                timeElapsed = 1;
            }


            uint256 distanceMeters =
                approximateDistanceMeters(

                    lastScan.latitude,

                    lastScan.longitude,

                    _latitude,

                    _longitude
                );


            // Speed calculation:
            // Result is km/h multiplied by 100
            //
            // Example:
            // 12000 = 120.00 km/h

            impliedSpeedScaled =
                (distanceMeters * 360) / timeElapsed;


            if (
                impliedSpeedScaled >
                maxPlausibleSpeedScaled
            ) {

                suspicious = true;

                product.hasSuspiciousScan = true;


                emit SuspiciousActivity(

                    _productId,

                    "Implausible travel speed detected"
                );
            }
        }


        // Store scan record

        scanHistory[_productId].push(

            ScanRecord({

                latitude: _latitude,

                longitude: _longitude,

                scanTimestamp: block.timestamp,

                scanner: msg.sender,

                context: _context,

                impliedSpeedScaled: impliedSpeedScaled,

                suspicious: suspicious
            })
        );


        emit ProductScanned(

            _productId,

            _latitude,

            _longitude,

            product.scanCount,

            suspicious
        );


        return (
            true,
            suspicious
        );
    }


    // ------------------------------------
    // APPROXIMATE DISTANCE CALCULATION
    // ------------------------------------

    function approximateDistanceMeters(

        int256 lat1,

        int256 lon1,

        int256 lat2,

        int256 lon2

    )
        public
        pure
        returns (uint256)
    {

        int256 dLat = lat2 - lat1;

        int256 dLon = lon2 - lon1;


        uint256 dLatAbs =

            dLat >= 0

                ? uint256(dLat)

                : uint256(-dLat);


        uint256 dLonAbs =

            dLon >= 0

                ? uint256(dLon)

                : uint256(-dLon);


        // Approximation:
        // 1 degree is approximately 111,000 meters

        return (

            (dLatAbs + dLonAbs) * 111000

        ) / 1000000;
    }


    // ------------------------------------
    // PRODUCT VERIFICATION
    // ------------------------------------

    function verifyProduct(

        string memory _productId

    )
        public
        view
        returns (

            string memory name,

            string memory batchNumber,

            string memory referenceImageCID,

            address manufacturer,

            uint256 registeredAt,

            bool exists,

            uint256 scanCount,

            bool hasSuspiciousScan

        )
    {

        Product memory product =
            products[_productId];


        return (

            product.name,

            product.batchNumber,

            product.referenceImageCID,

            product.manufacturer,

            product.registeredAt,

            product.exists,

            product.scanCount,

            product.hasSuspiciousScan
        );
    }


    // ------------------------------------
    // SCAN HISTORY
    // ------------------------------------

    /**
     * Return the total number of verification scan audits recorded for a product.
     * This includes privacy-safe `recordScanAudit` events used by the web app.
     * It does not expose precise customer coordinates.
     */
    function getScanCount(
        string memory _productId
    )
        public
        view
        returns (uint256)
    {
        return products[_productId].scanCount;
    }

    /**
     * Return the count of legacy direct scan records that store coordinates on-chain.
     * New web verification should use `recordScanAudit` and keep detailed coordinates
     * off-chain; this count exists for compatibility with the original demo contract.
     */
    function getLocationScanRecordCount(
        string memory _productId
    )
        public
        view
        returns (uint256)
    {
        return scanHistory[_productId].length;
    }


    function getScanRecord(

        string memory _productId,

        uint256 _index

    )
        public
        view
        returns (

            int256 latitude,

            int256 longitude,

            uint256 scanTimestamp,

            address scanner,

            ScanContext context,

            uint256 impliedSpeedScaled,

            bool suspicious

        )
    {

        require(

            _index < scanHistory[_productId].length,

            "Invalid scan index"
        );


        ScanRecord memory record =

            scanHistory[_productId][_index];


        return (

            record.latitude,

            record.longitude,

            record.scanTimestamp,

            record.scanner,

            record.context,

            record.impliedSpeedScaled,

            record.suspicious
        );
    }


    // ------------------------------------
    // ADMIN SETTINGS
    // ------------------------------------

    function setMaxPlausibleSpeed(

        uint256 _newSpeedScaled

    )
        public
        onlyOwner
    {

        require(

            _newSpeedScaled > 0,

            "Speed must be greater than zero"
        );


        maxPlausibleSpeedScaled =

            _newSpeedScaled;
    }

}