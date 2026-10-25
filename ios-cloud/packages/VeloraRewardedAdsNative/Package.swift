// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VeloraRewardedAdsNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "VeloraRewardedAdsNative", targets: ["VeloraRewardedAdsNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git", exact: "13.11.0")
    ],
    targets: [
        .target(
            name: "VeloraRewardedAdsNative",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads")
            ],
            path: "ios/Sources/VeloraRewardedAdsNative"
        )
    ]
)
