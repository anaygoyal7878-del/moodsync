import XCTest
@testable import MoodSyncCompanion

final class SleepEfficiencyCalculatorTests: XCTestCase {
    private let referenceDate = Date(timeIntervalSince1970: 1_752_000_000)

    private func sample(_ stage: SleepStageSample.Stage, minutes: Double, offsetMinutes: Double) -> SleepStageSample {
        let start = referenceDate.addingTimeInterval(offsetMinutes * 60)
        let end = start.addingTimeInterval(minutes * 60)
        return SleepStageSample(stage: stage, start: start, end: end)
    }

    func testComputesEfficiencyFromAsleepAndAwakeSegments() {
        let samples = [
            sample(.asleep, minutes: 420, offsetMinutes: 0), // 7h asleep
            sample(.awake, minutes: 30, offsetMinutes: 420), // 30m awake
        ]
        // 420 / (420 + 30) = 93.33...
        XCTAssertEqual(SleepEfficiencyCalculator.efficiency(from: samples)!, 93.33, accuracy: 0.1)
    }

    func testExcludesInBedSegmentsFromTheCalculation() {
        let withInBed = [
            sample(.inBed, minutes: 480, offsetMinutes: 0),
            sample(.asleep, minutes: 420, offsetMinutes: 0),
            sample(.awake, minutes: 30, offsetMinutes: 420),
        ]
        let withoutInBed = [
            sample(.asleep, minutes: 420, offsetMinutes: 0),
            sample(.awake, minutes: 30, offsetMinutes: 420),
        ]
        XCTAssertEqual(
            SleepEfficiencyCalculator.efficiency(from: withInBed),
            SleepEfficiencyCalculator.efficiency(from: withoutInBed)
        )
    }

    func testReturnsNilForNoData() {
        XCTAssertNil(SleepEfficiencyCalculator.efficiency(from: []))
    }

    func testReturnsNilWhenOnlyInBedSamplesExist() {
        XCTAssertNil(SleepEfficiencyCalculator.efficiency(from: [sample(.inBed, minutes: 480, offsetMinutes: 0)]))
    }

    func testPerfectSleepIsOneHundred() {
        let samples = [sample(.asleep, minutes: 480, offsetMinutes: 0)]
        XCTAssertEqual(SleepEfficiencyCalculator.efficiency(from: samples), 100)
    }
}
