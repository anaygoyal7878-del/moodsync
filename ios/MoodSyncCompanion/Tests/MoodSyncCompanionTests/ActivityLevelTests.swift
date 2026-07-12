import XCTest
@testable import MoodSyncCompanion

final class ActivityLevelTests: XCTestCase {
    func testHalfOfBenchmarkStepsIsFiftyPercent() {
        XCTAssertEqual(ActivityLevel.from(steps: 5_000), 50, accuracy: 0.001)
    }

    func testCapsAtOneHundredPercent() {
        XCTAssertEqual(ActivityLevel.from(steps: 20_000), 100)
    }

    func testZeroStepsIsZeroPercent() {
        XCTAssertEqual(ActivityLevel.from(steps: 0), 0)
    }
}
